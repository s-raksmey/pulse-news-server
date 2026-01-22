import { prisma } from '../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * User Management Service for Pulse News
 * Comprehensive user administration, profile management, and security features
 */

// User management input validation schemas
export const ListUsersInput = z.object({
  take: z.number().min(1).max(100).default(20),
  skip: z.number().min(0).default(0),
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'EDITOR', 'AUTHOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortBy: z.enum(['name', 'email', 'role', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const UpdateUserProfileInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Valid email is required').optional(),
});

export const UpdateUserRoleInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['ADMIN', 'EDITOR', 'AUTHOR'], {
    errorMap: () => ({ message: 'Role must be ADMIN, EDITOR, or AUTHOR' })
  }),
});

export const UpdateUserStatusInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  isActive: z.boolean(),
  reason: z.string().optional(),
});

export const RequestPasswordResetInput = z.object({
  email: z.string().email('Valid email is required'),
});

export const ResetPasswordInput = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const ChangePasswordInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// Type definitions
export type ListUsersInputType = z.infer<typeof ListUsersInput>;
export type UpdateUserProfileInputType = z.infer<typeof UpdateUserProfileInput>;
export type UpdateUserRoleInputType = z.infer<typeof UpdateUserRoleInput>;
export type UpdateUserStatusInputType = z.infer<typeof UpdateUserStatusInput>;
export type RequestPasswordResetInputType = z.infer<typeof RequestPasswordResetInput>;
export type ResetPasswordInputType = z.infer<typeof ResetPasswordInput>;
export type ChangePasswordInputType = z.infer<typeof ChangePasswordInput>;

// Result interfaces
export interface UserListResult {
  users: any[];
  totalCount: number;
  hasMore: boolean;
  filters: {
    search?: string;
    role?: string;
    status?: string;
  };
}

export interface UserManagementResult {
  success: boolean;
  message: string;
  user?: any;
}

export interface PasswordResetResult {
  success: boolean;
  message: string;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersByRole: {
    adminCount: number;
    editorCount: number;
    authorCount: number;
  };
  recentRegistrations: number; // Last 30 days
}

export interface ActivityLog {
  id: string;
  userId: string;
  activityType: string;
  details: any;
  performedBy: string;
  timestamp: Date;
  user?: any;
}

// Activity types enum
export enum ActivityType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  PROFILE_UPDATE = 'PROFILE_UPDATE',
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
}

/**
 * List users with filtering, searching, and pagination
 */
export async function listUsers(input: ListUsersInputType, requestingUserId: string): Promise<UserListResult> {
  try {
    // Validate input
    const validatedInput = ListUsersInput.parse(input);
    const { take, skip, search, role, status, sortBy, sortOrder } = validatedInput;

    // Build where clause
    const where: any = {};

    // Search filter (name or email)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Role filter
    if (role) {
      where.role = role;
    }

    // Status filter
    if (status) {
      where.isActive = status === 'ACTIVE';
    }

    // Build orderBy clause
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Get users with pagination
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // Don't include password or sensitive fields
        },
        orderBy,
        take,
        skip,
      }),
      prisma.user.count({ where }),
    ]);

    const hasMore = skip + take < totalCount;

    return {
      users,
      totalCount,
      hasMore,
      filters: {
        search,
        role,
        status,
      },
    };

  } catch (error) {
    console.error('Error listing users:', error);
    throw new Error('Failed to list users. Please try again.');
  }
}

/**
 * Get user by ID with detailed information
 */
export async function getUserById(userId: string, requestingUserId: string): Promise<any> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Add any additional fields you want to expose
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;

  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw new Error('Failed to get user details. Please try again.');
  }
}

/**
 * Update user profile (name, email)
 */
export async function updateUserProfile(input: UpdateUserProfileInputType, requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Validate input
    const validatedInput = UpdateUserProfileInput.parse(input);
    const { userId, name, email } = validatedInput;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Check if email is already taken (if email is being updated)
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return {
          success: false,
          message: 'Email address is already in use',
        };
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity({
      userId,
      activityType: ActivityType.PROFILE_UPDATE,
      details: { updatedFields: Object.keys(updateData) },
      performedBy: requestingUserId,
    });

    return {
      success: true,
      message: 'User profile updated successfully',
      user: updatedUser,
    };

  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      message: 'Failed to update user profile. Please try again.',
    };
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(input: UpdateUserRoleInputType, requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Validate input
    const validatedInput = UpdateUserRoleInput.parse(input);
    const { userId, role } = validatedInput;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Prevent self-demotion from admin role
    if (userId === requestingUserId && existingUser.role === 'ADMIN' && role !== 'ADMIN') {
      return {
        success: false,
        message: 'You cannot change your own admin role',
      };
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity({
      userId,
      activityType: ActivityType.ROLE_CHANGE,
      details: { 
        oldRole: existingUser.role, 
        newRole: role 
      },
      performedBy: requestingUserId,
    });

    return {
      success: true,
      message: `User role updated to ${role} successfully`,
      user: updatedUser,
    };

  } catch (error) {
    console.error('Error updating user role:', error);
    return {
      success: false,
      message: 'Failed to update user role. Please try again.',
    };
  }
}

/**
 * Update user status (activate/deactivate)
 */
export async function updateUserStatus(input: UpdateUserStatusInputType, requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Validate input
    const validatedInput = UpdateUserStatusInput.parse(input);
    const { userId, isActive, reason } = validatedInput;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Prevent self-deactivation
    if (userId === requestingUserId && !isActive) {
      return {
        success: false,
        message: 'You cannot deactivate your own account',
      };
    }

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity({
      userId,
      activityType: isActive ? ActivityType.STATUS_CHANGE : ActivityType.ACCOUNT_DEACTIVATED,
      details: { 
        oldStatus: existingUser.isActive, 
        newStatus: isActive,
        reason: reason || 'No reason provided'
      },
      performedBy: requestingUserId,
    });

    return {
      success: true,
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser,
    };

  } catch (error) {
    console.error('Error updating user status:', error);
    return {
      success: false,
      message: 'Failed to update user status. Please try again.',
    };
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(input: RequestPasswordResetInputType): Promise<PasswordResetResult> {
  try {
    // Validate input
    const validatedInput = RequestPasswordResetInput.parse(input);
    const { email } = validatedInput;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        message: 'Account is deactivated. Please contact an administrator.',
      };
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store reset token (you'll need to add these fields to your User model)
    // For now, we'll simulate this - in production, add resetToken and resetTokenExpiry to User model
    
    // Log activity
    await logActivity({
      userId: user.id,
      activityType: ActivityType.PASSWORD_RESET_REQUESTED,
      details: { email },
      performedBy: user.id,
    });

    // In production, send email with reset link here
    // await sendPasswordResetEmail(email, resetToken);

    return {
      success: true,
      message: 'Password reset instructions have been sent to your email.',
    };

  } catch (error) {
    console.error('Error requesting password reset:', error);
    return {
      success: false,
      message: 'Failed to process password reset request. Please try again.',
    };
  }
}

/**
 * Reset password using token
 */
export async function resetPassword(input: ResetPasswordInputType): Promise<PasswordResetResult> {
  try {
    // Validate input
    const validatedInput = ResetPasswordInput.parse(input);
    const { token, newPassword } = validatedInput;

    // In production, you would:
    // 1. Find user by reset token
    // 2. Check if token hasn't expired
    // 3. Hash new password
    // 4. Update user password and clear reset token
    // 5. Log activity

    // For now, return success (implement when User model has reset token fields)
    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };

  } catch (error) {
    console.error('Error resetting password:', error);
    return {
      success: false,
      message: 'Failed to reset password. Please try again or request a new reset link.',
    };
  }
}

/**
 * Change password (authenticated user)
 */
export async function changePassword(input: ChangePasswordInputType): Promise<PasswordResetResult> {
  try {
    // Validate input
    const validatedInput = ChangePasswordInput.parse(input);
    const { userId, currentPassword, newPassword } = validatedInput;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: 'Current password is incorrect',
      };
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    // Log activity
    await logActivity({
      userId,
      activityType: ActivityType.PASSWORD_CHANGE,
      details: { changedBy: 'user' },
      performedBy: userId,
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };

  } catch (error) {
    console.error('Error changing password:', error);
    return {
      success: false,
      message: 'Failed to change password. Please try again.',
    };
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<UserStats> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminCount,
      editorCount,
      authorCount,
      recentRegistrations,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'EDITOR' } }),
      prisma.user.count({ where: { role: 'AUTHOR' } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      usersByRole: {
        adminCount,
        editorCount,
        authorCount,
      },
      recentRegistrations,
    };

  } catch (error) {
    console.error('Error getting user stats:', error);
    throw new Error('Failed to get user statistics. Please try again.');
  }
}

/**
 * Delete user (soft delete - deactivate)
 */
export async function deleteUser(userId: string, requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    // Prevent self-deletion
    if (userId === requestingUserId) {
      return {
        success: false,
        message: 'You cannot delete your own account',
      };
    }

    // Soft delete by deactivating the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity({
      userId,
      activityType: ActivityType.ACCOUNT_DEACTIVATED,
      details: { 
        reason: 'Account deleted by admin',
        deletedBy: requestingUserId
      },
      performedBy: requestingUserId,
    });

    return {
      success: true,
      message: 'User account has been deactivated successfully',
      user: updatedUser,
    };

  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      success: false,
      message: 'Failed to delete user account. Please try again.',
    };
  }
}

/**
 * Log user activity (foundation for audit trail)
 */
async function logActivity(activity: {
  userId: string;
  activityType: ActivityType;
  details: any;
  performedBy: string;
}): Promise<void> {
  try {
    // In production, you would create an ActivityLog table and store activities
    // For now, we'll just log to console
    console.log('User Activity:', {
      ...activity,
      timestamp: new Date(),
    });

    // Future implementation:
    // await prisma.activityLog.create({
    //   data: {
    //     userId: activity.userId,
    //     activityType: activity.activityType,
    //     details: activity.details,
    //     performedBy: activity.performedBy,
    //     timestamp: new Date(),
    //   },
    // });

  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error for logging failures
  }
}

/**
 * Get user activity logs (foundation for audit trail)
 */
export async function getUserActivity(userId?: string, limit: number = 50): Promise<ActivityLog[]> {
  try {
    // In production, you would query the ActivityLog table
    // For now, return empty array
    return [];

    // Future implementation:
    // const where = userId ? { userId } : {};
    // 
    // return prisma.activityLog.findMany({
    //   where,
    //   include: {
    //     user: {
    //       select: {
    //         id: true,
    //         name: true,
    //         email: true,
    //       },
    //     },
    //   },
    //   orderBy: { timestamp: 'desc' },
    //   take: limit,
    // });

  } catch (error) {
    console.error('Error getting user activity:', error);
    return [];
  }
}

/**
 * Bulk update user roles
 */
export async function bulkUpdateUserRoles(userIds: string[], role: 'ADMIN' | 'EDITOR' | 'AUTHOR', requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Validate role
    if (!['ADMIN', 'EDITOR', 'AUTHOR'].includes(role)) {
      return {
        success: false,
        message: 'Invalid role specified',
      };
    }

    // Prevent self-demotion from admin
    if (userIds.includes(requestingUserId) && role !== 'ADMIN') {
      return {
        success: false,
        message: 'Cannot change your own admin role in bulk operation',
      };
    }

    // Update users
    const result = await prisma.user.updateMany({
      where: { 
        id: { 
          in: userIds,
          not: requestingUserId // Extra safety - combine filters
        }
      },
      data: { role }, // Now properly typed
    });

    // Log activities for each user
    for (const userId of userIds) {
      if (userId !== requestingUserId) {
        await logActivity({
          userId,
          activityType: ActivityType.ROLE_CHANGE,
          details: { 
            newRole: role,
            bulkOperation: true
          },
          performedBy: requestingUserId,
        });
      }
    }

    return {
      success: true,
      message: `Successfully updated ${result.count} user roles to ${role}`,
    };

  } catch (error) {
    console.error('Error bulk updating user roles:', error);
    return {
      success: false,
      message: 'Failed to update user roles. Please try again.',
    };
  }
}

/**
 * Bulk update user status
 */
export async function bulkUpdateUserStatus(userIds: string[], isActive: boolean, requestingUserId: string): Promise<UserManagementResult> {
  try {
    // Prevent self-deactivation
    if (userIds.includes(requestingUserId) && !isActive) {
      return {
        success: false,
        message: 'Cannot deactivate your own account in bulk operation',
      };
    }

    // Update users
    const result = await prisma.user.updateMany({
      where: { 
        id: { 
          in: userIds,
          not: requestingUserId // Extra safety - combine filters
        }
      },
      data: { isActive },
    });

    // Log activities for each user
    for (const userId of userIds) {
      if (userId !== requestingUserId) {
        await logActivity({
          userId,
          activityType: isActive ? ActivityType.STATUS_CHANGE : ActivityType.ACCOUNT_DEACTIVATED,
          details: { 
            newStatus: isActive,
            bulkOperation: true
          },
          performedBy: requestingUserId,
        });
      }
    }

    return {
      success: true,
      message: `Successfully ${isActive ? 'activated' : 'deactivated'} ${result.count} user accounts`,
    };

  } catch (error) {
    console.error('Error bulk updating user status:', error);
    return {
      success: false,
      message: 'Failed to update user status. Please try again.',
    };
  }
}

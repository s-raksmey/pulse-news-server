// src/services/userManagementService.ts
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface UserManagementResult {
  success: boolean;
  message: string;
  user?: any;
}

export interface PasswordResetResult {
  success: boolean;
  message: string;
}

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

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersByRole: {
    admin: number;
    editor: number;
    author: number;
  };
  recentRegistrations: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  activityType: string;
  details?: any;
  performedBy: string;
  timestamp: Date;
  user?: any;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export const CreateUserInput = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'EDITOR', 'AUTHOR']).default('AUTHOR'),
  isActive: z.boolean().default(true),
  sendWelcomeEmail: z.boolean().default(true),
});

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
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email format'),
});

export const UpdateUserRoleInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['ADMIN', 'EDITOR', 'AUTHOR'], {
    errorMap: () => ({ message: 'Role must be ADMIN, EDITOR, or AUTHOR' }),
  }),
});

export const UpdateUserStatusInput = z.object({
  userId: z.string().min(1, 'User ID is required'),
  isActive: z.boolean(),
  reason: z.string().optional(),
});

export const RequestPasswordResetInput = z.object({
  email: z.string().email('Invalid email format'),
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a secure random token for password reset
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Log user activity for audit trails
 */
async function logActivity(
  userId: string,
  activityType: string,
  performedBy: string,
  details?: any
): Promise<void> {
  try {
    // Note: This would require an ActivityLog table in the database
    // For now, we'll just log to console in development
    console.log(`Activity Log: ${activityType} for user ${userId} by ${performedBy}`, details);

    // TODO: Implement actual database logging when ActivityLog table is created
    // await prisma.activityLog.create({
    //   data: {
    //     userId,
    //     activityType,
    //     performedBy,
    //     details: details ? JSON.stringify(details) : null,
    //   },
    // });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// ============================================================================
// CORE USER MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Create a new user with validation and security
 */
export async function createUser(
  input: z.infer<typeof CreateUserInput>,
  createdBy: string
): Promise<UserManagementResult> {
  try {
    // Validate input
    const validatedInput = CreateUserInput.parse(input);
    const { name, email, password, role, isActive, sendWelcomeEmail } = validatedInput;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return {
        success: false,
        message: 'A user with this email already exists',
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(user.id, 'USER_CREATED', createdBy, {
      userRole: role,
      isActive,
      sendWelcomeEmail,
    });

    // TODO: Send welcome email if requested
    if (sendWelcomeEmail) {
      console.log(`TODO: Send welcome email to ${email}`);
    }

    return {
      success: true,
      message: 'User created successfully',
      user,
    };
  } catch (error) {
    console.error('Error creating user:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: `Validation error: ${error.errors.map((e) => e.message).join(', ')}`,
      };
    }

    return {
      success: false,
      message: 'Failed to create user',
    };
  }
}

/**
 * List users with pagination, search, and filtering
 */
export async function listUsers(
  input: z.infer<typeof ListUsersInput>,
  requestingUserId: string
): Promise<UserListResult> {
  try {
    const validatedInput = ListUsersInput.parse(input);
    const { take, skip, search, role, status, sortBy, sortOrder } = validatedInput;

    // Build where clause for filtering
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.isActive = status === 'ACTIVE';
    }

    // Get total count for pagination
    const totalCount = await prisma.user.count({ where });

    // Get users with pagination and sorting
    const users = await prisma.user.findMany({
      where,
      take,
      skip,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(requestingUserId, 'USER_LIST_ACCESSED', requestingUserId, {
      filters: { search, role, status },
      resultCount: users.length,
    });

    return {
      users,
      totalCount,
      hasMore: skip + take < totalCount,
      filters: { search, role, status },
    };
  } catch (error) {
    console.error('Error listing users:', error);
    throw new Error('Failed to list users');
  }
}

/**
 * Get user by ID with access control
 */
export async function getUserById(
  userId: string,
  requestingUserId: string,
  isAdmin: boolean = false
): Promise<any> {
  try {
    // Users can only view their own profile unless they're admin
    if (!isAdmin && userId !== requestingUserId) {
      throw new Error('Access denied: You can only view your own profile');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Log activity
    await logActivity(userId, 'PROFILE_VIEWED', requestingUserId);

    return user;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Update user profile (name and email)
 */
export async function updateUserProfile(
  input: z.infer<typeof UpdateUserProfileInput>,
  requestingUserId: string,
  isAdmin: boolean = false
): Promise<UserManagementResult> {
  try {
    const validatedInput = UpdateUserProfileInput.parse(input);
    const { userId, name, email } = validatedInput;

    // Users can only update their own profile unless they're admin
    if (!isAdmin && userId !== requestingUserId) {
      return {
        success: false,
        message: 'Access denied: You can only update your own profile',
      };
    }

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

    // Check if email is already taken by another user
    if (email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId },
        },
      });

      if (emailExists) {
        return {
          success: false,
          message: 'Email address is already in use',
        };
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(userId, 'PROFILE_UPDATED', requestingUserId, {
      changes: { name, email },
    });

    return {
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      message: 'Failed to update profile',
    };
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(
  input: z.infer<typeof UpdateUserRoleInput>,
  requestingUserId: string
): Promise<UserManagementResult> {
  try {
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
        message: 'You cannot demote yourself from admin role',
      };
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(userId, 'ROLE_CHANGED', requestingUserId, {
      oldRole: existingUser.role,
      newRole: role,
    });

    return {
      success: true,
      message: `User role updated to ${role}`,
      user: updatedUser,
    };
  } catch (error) {
    console.error('Error updating user role:', error);
    return {
      success: false,
      message: 'Failed to update user role',
    };
  }
}

/**
 * Update user status (activate/deactivate) - admin only
 */
export async function updateUserStatus(
  input: z.infer<typeof UpdateUserStatusInput>,
  requestingUserId: string
): Promise<UserManagementResult> {
  try {
    const validatedInput = UpdateUserStatusInput.parse(input);
    const { userId, isActive, reason } = validatedInput;

    // Prevent self-deactivation
    if (userId === requestingUserId && !isActive) {
      return {
        success: false,
        message: 'You cannot deactivate your own account',
      };
    }

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

    // Update user status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(userId, 'STATUS_CHANGED', requestingUserId, {
      oldStatus: existingUser.isActive ? 'ACTIVE' : 'INACTIVE',
      newStatus: isActive ? 'ACTIVE' : 'INACTIVE',
      reason,
    });

    return {
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser,
    };
  } catch (error) {
    console.error('Error updating user status:', error);
    return {
      success: false,
      message: 'Failed to update user status',
    };
  }
}

/**
 * Soft delete user (deactivate) - admin only
 */
export async function deleteUser(
  userId: string,
  requestingUserId: string
): Promise<UserManagementResult> {
  try {
    // Prevent self-deletion
    if (userId === requestingUserId) {
      return {
        success: false,
        message: 'You cannot delete your own account',
      };
    }

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

    // Soft delete by deactivating the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log activity
    await logActivity(userId, 'ACCOUNT_DEACTIVATED', requestingUserId, {
      reason: 'Account deleted by admin',
    });

    return {
      success: true,
      message: 'User account deactivated successfully',
      user: updatedUser,
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      success: false,
      message: 'Failed to delete user',
    };
  }
}

// ============================================================================
// PASSWORD MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Request password reset
 */
export async function requestPasswordReset(
  input: z.infer<typeof RequestPasswordResetInput>
): Promise<PasswordResetResult> {
  try {
    const validatedInput = RequestPasswordResetInput.parse(input);
    const { email } = validatedInput;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists for security
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent',
      };
    }

    // Generate reset token
    const resetToken = generateSecureToken();
    const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Note: This would require resetToken and resetTokenExpiry fields in User model
    // For now, we'll simulate the process
    console.log(`Password reset requested for ${email}. Token: ${resetToken}`);

    // TODO: Update user with reset token when fields are added to schema
    // await prisma.user.update({
    //   where: { id: user.id },
    //   data: {
    //     resetToken,
    //     resetTokenExpiry,
    //   },
    // });

    // TODO: Send email with reset link
    // await sendPasswordResetEmail(email, resetToken);

    // Log activity
    await logActivity(user.id, 'PASSWORD_RESET_REQUESTED', user.id);

    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    };
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return {
      success: false,
      message: 'Failed to process password reset request',
    };
  }
}

/**
 * Reset password using token
 */
export async function resetPassword(
  input: z.infer<typeof ResetPasswordInput>
): Promise<PasswordResetResult> {
  try {
    const validatedInput = ResetPasswordInput.parse(input);
    const { token, newPassword } = validatedInput;

    // TODO: Find user by reset token when fields are added to schema
    // const user = await prisma.user.findFirst({
    //   where: {
    //     resetToken: token,
    //     resetTokenExpiry: { gt: new Date() },
    //   },
    // });

    // For now, simulate token validation
    console.log(`Password reset attempted with token: ${token}`);

    // Simulate user lookup (replace with actual implementation)
    const user = null; // This would be the actual user from token lookup

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired reset token',
      };
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // TODO: Update user password and clear reset token
    // await prisma.user.update({
    //   where: { id: user.id },
    //   data: {
    //     password: hashedPassword,
    //     resetToken: null,
    //     resetTokenExpiry: null,
    //   },
    // });

    // Log activity
    // await logActivity(user.id, 'PASSWORD_RESET_COMPLETED', user.id);

    return {
      success: true,
      message: 'Password reset successfully',
    };
  } catch (error) {
    console.error('Error resetting password:', error);
    return {
      success: false,
      message: 'Failed to reset password',
    };
  }
}

/**
 * Change password (authenticated user)
 */
export async function changePassword(
  input: z.infer<typeof ChangePasswordInput>
): Promise<PasswordResetResult> {
  try {
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
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: 'Current password is incorrect',
      };
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    // Log activity
    await logActivity(userId, 'PASSWORD_CHANGED', userId);

    return {
      success: true,
      message: 'Password changed successfully',
    };
  } catch (error) {
    console.error('Error changing password:', error);
    return {
      success: false,
      message: 'Failed to change password',
    };
  }
}

// ============================================================================
// ANALYTICS AND STATISTICS
// ============================================================================

/**
 * Get user statistics for dashboard
 */
export async function getUserStats(): Promise<UserStats> {
  try {
    // Get total user count
    const totalUsers = await prisma.user.count();

    // Get active/inactive counts
    const activeUsers = await prisma.user.count({
      where: { isActive: true },
    });
    const inactiveUsers = totalUsers - activeUsers;

    // Get users by role
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN' },
    });
    const editorCount = await prisma.user.count({
      where: { role: 'EDITOR' },
    });
    const authorCount = await prisma.user.count({
      where: { role: 'AUTHOR' },
    });

    // Get recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await prisma.user.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      usersByRole: {
        admin: adminCount,
        editor: editorCount,
        author: authorCount,
      },
      recentRegistrations,
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    throw new Error('Failed to get user statistics');
  }
}

/**
 * Get user activity logs
 */
export async function getUserActivity(userId?: string, limit: number = 50): Promise<ActivityLog[]> {
  try {
    // TODO: Implement when ActivityLog table is created
    // For now, return empty array
    console.log(`Getting activity logs for user: ${userId || 'all'}, limit: ${limit}`);

    return [];

    // Future implementation:
    // const where = userId ? { userId } : {};
    // const activities = await prisma.activityLog.findMany({
    //   where,
    //   take: limit,
    //   orderBy: { timestamp: 'desc' },
    //   include: {
    //     user: {
    //       select: {
    //         id: true,
    //         name: true,
    //         email: true,
    //       },
    //     },
    //   },
    // });
    // return activities;
  } catch (error) {
    console.error('Error getting user activity:', error);
    return [];
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update user roles (admin only)
 */
export async function bulkUpdateUserRoles(
  userIds: string[],
  role: 'ADMIN' | 'EDITOR' | 'AUTHOR',
  requestingUserId: string
): Promise<UserManagementResult> {
  try {
    if (userIds.length === 0) {
      return {
        success: false,
        message: 'No users selected',
      };
    }

    // Prevent self-demotion from admin role
    if (userIds.includes(requestingUserId) && role !== 'ADMIN') {
      const requestingUser = await prisma.user.findUnique({
        where: { id: requestingUserId },
        select: { role: true },
      });

      if (requestingUser?.role === 'ADMIN') {
        return {
          success: false,
          message: 'You cannot demote yourself from admin role',
        };
      }
    }

    // Update users in bulk
    const result = await prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
          not: requestingUserId, // Extra safety - combine filters properly
        },
      },
      data: { role }, // Now properly typed
    });

    // Log activities for each user
    for (const userId of userIds) {
      if (userId !== requestingUserId) {
        await logActivity(userId, 'ROLE_CHANGED', requestingUserId, {
          newRole: role,
          bulkOperation: true,
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
      message: 'Failed to update user roles',
    };
  }
}

/**
 * Bulk update user status (admin only)
 */
export async function bulkUpdateUserStatus(
  userIds: string[],
  isActive: boolean,
  requestingUserId: string
): Promise<UserManagementResult> {
  try {
    if (userIds.length === 0) {
      return {
        success: false,
        message: 'No users selected',
      };
    }

    // Prevent self-deactivation
    if (userIds.includes(requestingUserId) && !isActive) {
      return {
        success: false,
        message: 'You cannot deactivate your own account',
      };
    }

    // Update users in bulk
    const result = await prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
          not: requestingUserId, // Extra safety - combine filters properly
        },
      },
      data: { isActive },
    });

    // Log activities for each user
    for (const userId of userIds) {
      if (userId !== requestingUserId) {
        await logActivity(userId, 'STATUS_CHANGED', requestingUserId, {
          newStatus: isActive ? 'ACTIVE' : 'INACTIVE',
          bulkOperation: true,
        });
      }
    }

    return {
      success: true,
      message: `Successfully ${isActive ? 'activated' : 'deactivated'} ${result.count} users`,
    };
  } catch (error) {
    console.error('Error bulk updating user status:', error);
    return {
      success: false,
      message: 'Failed to update user status',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core user operations
  listUsers,
  getUserById,
  updateUserProfile,
  updateUserRole,
  updateUserStatus,
  deleteUser,

  // Password management
  requestPasswordReset,
  resetPassword,
  changePassword,

  // Analytics
  getUserStats,
  getUserActivity,

  // Bulk operations
  bulkUpdateUserRoles,
  bulkUpdateUserStatus,

  // Utility functions
  logActivity,
  hashPassword,
  verifyPassword,
};

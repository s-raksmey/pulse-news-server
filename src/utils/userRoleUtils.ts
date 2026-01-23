import { prisma } from '../lib/prisma.js';

/**
 * User Role Enum
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  AUTHOR = 'AUTHOR'
}

/**
 * Check if a user has a specific role
 */
export async function userHasRole(userId: string, role: UserRole): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });
    
    return user?.isActive && user.role === role;
  } catch (error) {
    console.error('❌ Error checking user role:', error);
    return false;
  }
}

/**
 * Check if a user has any of the specified roles
 */
export async function userHasAnyRole(userId: string, roles: UserRole[]): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });
    
    return user?.isActive && roles.includes(user.role as UserRole);
  } catch (error) {
    console.error('❌ Error checking user roles:', error);
    return false;
  }
}

/**
 * Promote a user to ADMIN role by user ID
 */
export async function promoteUserToAdmin(userId: string): Promise<boolean> {
  try {
    console.log('ℹ️ Promoting user to admin:', userId);
    
    await prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.ADMIN }
    });
    
    console.log('✅ Successfully promoted user to admin:', userId);
    return true;
  } catch (error) {
    console.error('❌ Error promoting user to admin:', error);
    return false;
  }
}

/**
 * Promote a user to ADMIN role by email
 */
export async function promoteUserToAdminByEmail(email: string): Promise<boolean> {
  try {
    console.log('ℹ️ Looking up user by email for admin promotion:', email);
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true }
    });
    
    if (!user) {
      console.log('⚠️ User not found with email:', email);
      return false;
    }
    
    if (!user.isActive) {
      console.log('⚠️ User is not active:', email);
      return false;
    }
    
    if (user.role === UserRole.ADMIN) {
      console.log('ℹ️ User is already an admin:', email);
      return true;
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN }
    });
    
    console.log('✅ Successfully promoted user to admin by email:', email);
    return true;
  } catch (error) {
    console.error('❌ Error promoting user to admin by email:', error);
    return false;
  }
}

/**
 * Get all admin users
 */
export async function listAdminUsers(): Promise<Array<{ id: string; email: string; name: string }>> {
  try {
    const admins = await prisma.user.findMany({
      where: { 
        role: UserRole.ADMIN,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true
      },
      orderBy: { createdAt: 'asc' }
    });
    
    return admins;
  } catch (error) {
    console.error('❌ Error listing admin users:', error);
    return [];
  }
}

/**
 * Get user count by role
 */
export async function getUserCountByRole(): Promise<Record<UserRole, number>> {
  try {
    const counts = await prisma.user.groupBy({
      by: ['role'],
      where: { isActive: true },
      _count: { role: true }
    });
    
    const result: Record<UserRole, number> = {
      [UserRole.ADMIN]: 0,
      [UserRole.EDITOR]: 0,
      [UserRole.AUTHOR]: 0
    };
    
    counts.forEach(count => {
      if (count.role in result) {
        result[count.role as UserRole] = count._count.role;
      }
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error getting user count by role:', error);
    return {
      [UserRole.ADMIN]: 0,
      [UserRole.EDITOR]: 0,
      [UserRole.AUTHOR]: 0
    };
  }
}

/**
 * Ensure at least one admin user exists
 * If no admin exists, promote the first active user to admin
 */
export async function ensureAdminExists(): Promise<boolean> {
  try {
    // Check if any admin users exist
    const adminCount = await prisma.user.count({
      where: { 
        role: UserRole.ADMIN,
        isActive: true
      }
    });
    
    if (adminCount > 0) {
      console.log('✅ Admin users already exist, count:', adminCount);
      return true;
    }
    
    console.log('⚠️ No admin users found, looking for first active user to promote');
    
    // Find the first active user to promote
    const firstUser = await prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    });
    
    if (!firstUser) {
      console.log('❌ No active users found to promote to admin');
      return false;
    }
    
    console.log('ℹ️ Promoting first user to admin:', firstUser.email);
    
    await prisma.user.update({
      where: { id: firstUser.id },
      data: { role: UserRole.ADMIN }
    });
    
    console.log('✅ Successfully auto-promoted first user to admin:', firstUser.email);
    return true;
  } catch (error) {
    console.error('❌ Error ensuring admin exists:', error);
    return false;
  }
}

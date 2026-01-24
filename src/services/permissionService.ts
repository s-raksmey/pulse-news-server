// src/services/permissionService.ts
import { UserRole } from '@prisma/client';
import { GraphQLContext } from '../middleware/auth';

/**
 * Permission definitions for the RBAC system
 */
export enum Permission {
  // User Management
  CREATE_USER = 'CREATE_USER',
  UPDATE_USER = 'UPDATE_USER',
  DELETE_USER = 'DELETE_USER',
  VIEW_ALL_USERS = 'VIEW_ALL_USERS',
  MANAGE_USER_ROLES = 'MANAGE_USER_ROLES',
  
  // Article Management
  CREATE_ARTICLE = 'CREATE_ARTICLE',
  UPDATE_OWN_ARTICLE = 'UPDATE_OWN_ARTICLE',
  UPDATE_ANY_ARTICLE = 'UPDATE_ANY_ARTICLE',
  DELETE_OWN_ARTICLE = 'DELETE_OWN_ARTICLE',
  DELETE_ANY_ARTICLE = 'DELETE_ANY_ARTICLE',
  PUBLISH_ARTICLE = 'PUBLISH_ARTICLE',
  UNPUBLISH_ARTICLE = 'UNPUBLISH_ARTICLE',
  
  // Article Features
  SET_FEATURED = 'SET_FEATURED',
  SET_BREAKING_NEWS = 'SET_BREAKING_NEWS',
  SET_EDITORS_PICK = 'SET_EDITORS_PICK',
  
  // Content Review
  REVIEW_ARTICLES = 'REVIEW_ARTICLES',
  APPROVE_ARTICLES = 'APPROVE_ARTICLES',
  REJECT_ARTICLES = 'REJECT_ARTICLES',
  
  // Category Management
  CREATE_CATEGORY = 'CREATE_CATEGORY',
  UPDATE_CATEGORY = 'UPDATE_CATEGORY',
  DELETE_CATEGORY = 'DELETE_CATEGORY',
  
  // Settings Management
  VIEW_SETTINGS = 'VIEW_SETTINGS',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
  
  // System Management
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  SYSTEM_ADMINISTRATION = 'SYSTEM_ADMINISTRATION',
}

/**
 * Role-based permission matrix
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Full access to everything
    Permission.CREATE_USER,
    Permission.UPDATE_USER,
    Permission.DELETE_USER,
    Permission.VIEW_ALL_USERS,
    Permission.MANAGE_USER_ROLES,
    Permission.CREATE_ARTICLE,
    Permission.UPDATE_OWN_ARTICLE,
    Permission.UPDATE_ANY_ARTICLE,
    Permission.DELETE_OWN_ARTICLE,
    Permission.DELETE_ANY_ARTICLE,
    Permission.PUBLISH_ARTICLE,
    Permission.UNPUBLISH_ARTICLE,
    Permission.SET_FEATURED,
    Permission.SET_BREAKING_NEWS,
    Permission.SET_EDITORS_PICK,
    Permission.REVIEW_ARTICLES,
    Permission.APPROVE_ARTICLES,
    Permission.REJECT_ARTICLES,
    Permission.CREATE_CATEGORY,
    Permission.UPDATE_CATEGORY,
    Permission.DELETE_CATEGORY,
    Permission.VIEW_SETTINGS,
    Permission.UPDATE_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.SYSTEM_ADMINISTRATION,
  ],
  [UserRole.EDITOR]: [
    // Content management and editorial control
    Permission.VIEW_ALL_USERS, // Can view users for assignment purposes
    Permission.CREATE_ARTICLE,
    Permission.UPDATE_OWN_ARTICLE,
    Permission.UPDATE_ANY_ARTICLE,
    Permission.DELETE_OWN_ARTICLE,
    Permission.PUBLISH_ARTICLE,
    Permission.UNPUBLISH_ARTICLE,
    Permission.SET_FEATURED,
    Permission.SET_BREAKING_NEWS,
    Permission.SET_EDITORS_PICK,
    Permission.REVIEW_ARTICLES,
    Permission.APPROVE_ARTICLES,
    Permission.REJECT_ARTICLES,
    Permission.CREATE_CATEGORY,
    Permission.UPDATE_CATEGORY,
    Permission.VIEW_SETTINGS, // Can view but not modify
  ],
  [UserRole.AUTHOR]: [
    // Basic content creation
    Permission.CREATE_ARTICLE,
    Permission.UPDATE_OWN_ARTICLE,
    Permission.DELETE_OWN_ARTICLE,
  ],
};

/**
 * Permission Service for RBAC operations
 */
export class PermissionService {
  /**
   * Check if a user has a specific permission
   */
  static hasPermission(userRole: UserRole, permission: Permission): boolean {
    const rolePermissions = ROLE_PERMISSIONS[userRole];
    return rolePermissions.includes(permission);
  }

  /**
   * Check if a user has any of the specified permissions
   */
  static hasAnyPermission(userRole: UserRole, permissions: Permission[]): boolean {
    return permissions.some(permission => this.hasPermission(userRole, permission));
  }

  /**
   * Check if a user has all of the specified permissions
   */
  static hasAllPermissions(userRole: UserRole, permissions: Permission[]): boolean {
    return permissions.every(permission => this.hasPermission(userRole, permission));
  }

  /**
   * Get all permissions for a role
   */
  static getRolePermissions(userRole: UserRole): Permission[] {
    return ROLE_PERMISSIONS[userRole] || [];
  }

  /**
   * Check if user can access resource (ownership or elevated permissions)
   */
  static canAccessResource(
    context: GraphQLContext,
    resourceUserId: string,
    requiredPermissions: Permission[]
  ): boolean {
    if (!context.user) return false;

    // Check if user owns the resource
    if (context.user.id === resourceUserId) {
      return true;
    }

    // Check if user has elevated permissions
    const userRole = context.user.role as UserRole;
    return this.hasAnyPermission(userRole, requiredPermissions);
  }

  /**
   * Require specific permission or throw error
   */
  static requirePermission(context: GraphQLContext, permission: Permission): void {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const userRole = context.user.role as UserRole;
    if (!this.hasPermission(userRole, permission)) {
      throw new Error(`Permission denied: ${permission} required`);
    }
  }

  /**
   * Require any of the specified permissions or throw error
   */
  static requireAnyPermission(context: GraphQLContext, permissions: Permission[]): void {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const userRole = context.user.role as UserRole;
    if (!this.hasAnyPermission(userRole, permissions)) {
      throw new Error(`Permission denied: One of [${permissions.join(', ')}] required`);
    }
  }

  /**
   * Require resource access (ownership or elevated permissions)
   */
  static requireResourceAccess(
    context: GraphQLContext,
    resourceUserId: string,
    requiredPermissions: Permission[]
  ): void {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    if (!this.canAccessResource(context, resourceUserId, requiredPermissions)) {
      throw new Error('Access denied: You can only access your own resources or need elevated permissions');
    }
  }

  /**
   * Check if user can perform article workflow action
   */
  static canPerformWorkflowAction(
    userRole: UserRole,
    currentStatus: string,
    targetStatus: string,
    isOwner: boolean
  ): boolean {
    switch (targetStatus) {
      case 'DRAFT':
        // Anyone can save as draft if they own it, or editors/admins can modify any
        return isOwner || this.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE);
      
      case 'REVIEW':
        // Authors can submit for review, editors/admins can move to review
        return (isOwner && userRole === UserRole.AUTHOR) || 
               this.hasPermission(userRole, Permission.REVIEW_ARTICLES);
      
      case 'PUBLISHED':
        // Only editors and admins can publish
        return this.hasPermission(userRole, Permission.PUBLISH_ARTICLE);
      
      case 'ARCHIVED':
        // Only editors and admins can archive
        return this.hasPermission(userRole, Permission.UNPUBLISH_ARTICLE);
      
      default:
        return false;
    }
  }

  /**
   * Get available workflow actions for user
   */
  static getAvailableWorkflowActions(
    userRole: UserRole,
    currentStatus: string,
    isOwner: boolean
  ): string[] {
    const actions: string[] = [];
    const statuses = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'];

    for (const status of statuses) {
      if (status !== currentStatus && 
          this.canPerformWorkflowAction(userRole, currentStatus, status, isOwner)) {
        actions.push(status);
      }
    }

    return actions;
  }

  /**
   * Check if user can set article features (featured, breaking, editor's pick)
   */
  static canSetArticleFeatures(userRole: UserRole): boolean {
    return this.hasAnyPermission(userRole, [
      Permission.SET_FEATURED,
      Permission.SET_BREAKING_NEWS,
      Permission.SET_EDITORS_PICK
    ]);
  }

  /**
   * Get permission summary for a role (for UI display)
   */
  static getPermissionSummary(userRole: UserRole): {
    role: string;
    permissions: string[];
    description: string;
  } {
    const permissions = this.getRolePermissions(userRole);
    
    const descriptions = {
      [UserRole.ADMIN]: 'Full system control and platform governance',
      [UserRole.EDITOR]: 'Content quality, accuracy, and compliance management',
      [UserRole.AUTHOR]: 'Content creation and maintenance'
    };

    return {
      role: userRole,
      permissions: permissions.map(p => p.toString()),
      description: descriptions[userRole]
    };
  }
}

/**
 * Permission decorator for GraphQL resolvers
 */
export function requirePermissions(...permissions: Permission[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const context = args[1] as GraphQLContext; // Assuming context is second argument
      PermissionService.requireAnyPermission(context, permissions);
      return method.apply(this, args);
    };
  };
}

/**
 * Resource ownership decorator for GraphQL resolvers
 */
export function requireResourceOwnership(
  resourceUserIdGetter: (args: any) => string,
  fallbackPermissions: Permission[]
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const resolverArgs = args[0];
      const context = args[1] as GraphQLContext;
      const resourceUserId = resourceUserIdGetter(resolverArgs);
      
      PermissionService.requireResourceAccess(context, resourceUserId, fallbackPermissions);
      return method.apply(this, args);
    };
  };
}

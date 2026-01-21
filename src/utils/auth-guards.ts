import { GraphQLContext, requireAuth, requireRole, requireAdmin, requireEditor, requireAuthor, requireOwnershipOrRole } from "../middleware/auth";

/**
 * Decorator function type for GraphQL resolvers
 */
type ResolverFunction = (parent: any, args: any, context: GraphQLContext, info: any) => any;

/**
 * Higher-order function to wrap resolvers with authentication checks
 */
export function withAuth(resolver: ResolverFunction): ResolverFunction {
  return (parent: any, args: any, context: GraphQLContext, info: any) => {
    requireAuth(context);
    return resolver(parent, args, context, info);
  };
}

/**
 * Higher-order function to wrap resolvers with role-based authorization
 */
export function withRole(requiredRole: string | string[]) {
  return function (resolver: ResolverFunction): ResolverFunction {
    return (parent: any, args: any, context: GraphQLContext, info: any) => {
      requireRole(context, requiredRole);
      return resolver(parent, args, context, info);
    };
  };
}

/**
 * Higher-order function to wrap resolvers with admin authorization
 */
export function withAdmin(resolver: ResolverFunction): ResolverFunction {
  return (parent: any, args: any, context: GraphQLContext, info: any) => {
    requireAdmin(context);
    return resolver(parent, args, context, info);
  };
}

/**
 * Higher-order function to wrap resolvers with editor authorization
 */
export function withEditor(resolver: ResolverFunction): ResolverFunction {
  return (parent: any, args: any, context: GraphQLContext, info: any) => {
    requireEditor(context);
    return resolver(parent, args, context, info);
  };
}

/**
 * Higher-order function to wrap resolvers with author authorization
 */
export function withAuthor(resolver: ResolverFunction): ResolverFunction {
  return (parent: any, args: any, context: GraphQLContext, info: any) => {
    requireAuthor(context);
    return resolver(parent, args, context, info);
  };
}

/**
 * Higher-order function to wrap resolvers with ownership or role authorization
 */
export function withOwnershipOrRole(
  getUserId: (parent: any, args: any) => string,
  allowedRoles: string[] = ['ADMIN', 'EDITOR']
) {
  return function (resolver: ResolverFunction): ResolverFunction {
    return (parent: any, args: any, context: GraphQLContext, info: any) => {
      const resourceUserId = getUserId(parent, args);
      requireOwnershipOrRole(context, resourceUserId, allowedRoles);
      return resolver(parent, args, context, info);
    };
  };
}

/**
 * Utility function to check if user has permission without throwing
 */
export function hasPermission(context: GraphQLContext, requiredRole: string | string[]): boolean {
  try {
    requireRole(context, requiredRole);
    return true;
  } catch {
    return false;
  }
}

/**
 * Utility function to check if user is authenticated without throwing
 */
export function isAuthenticated(context: GraphQLContext): boolean {
  return !!context.user;
}

/**
 * Utility function to check if user is admin without throwing
 */
export function isAdmin(context: GraphQLContext): boolean {
  return context.user?.role === 'ADMIN';
}

/**
 * Utility function to check if user is editor or admin without throwing
 */
export function isEditor(context: GraphQLContext): boolean {
  return context.user?.role === 'ADMIN' || context.user?.role === 'EDITOR';
}

/**
 * Utility function to check if user is author, editor, or admin without throwing
 */
export function isAuthor(context: GraphQLContext): boolean {
  return ['ADMIN', 'EDITOR', 'AUTHOR'].includes(context.user?.role || '');
}

/**
 * Utility function to check if user owns resource or has elevated permissions without throwing
 */
export function canAccessResource(
  context: GraphQLContext, 
  resourceUserId: string, 
  allowedRoles: string[] = ['ADMIN', 'EDITOR']
): boolean {
  if (!context.user) return false;
  
  // Allow if user owns the resource
  if (context.user.id === resourceUserId) return true;
  
  // Allow if user has elevated role
  return allowedRoles.includes(context.user.role);
}

/**
 * Role hierarchy helper - checks if user role has sufficient permissions
 */
export function hasRoleOrHigher(context: GraphQLContext, minimumRole: string): boolean {
  if (!context.user) return false;
  
  const roleHierarchy = {
    'AUTHOR': 1,
    'EDITOR': 2,
    'ADMIN': 3,
  };
  
  const userRoleLevel = roleHierarchy[context.user.role as keyof typeof roleHierarchy] || 0;
  const requiredRoleLevel = roleHierarchy[minimumRole as keyof typeof roleHierarchy] || 0;
  
  return userRoleLevel >= requiredRoleLevel;
}

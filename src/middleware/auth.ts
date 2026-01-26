import { verifyToken, extractTokenFromHeader, createContextUser } from "../utils/jwt";
import { prisma } from "../lib/prisma";

/**
 * GraphQL Context type with optional authenticated user
 */
export interface GraphQLContext {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  };
  request: Request;
}

/**
 * JWT Authentication Middleware for GraphQL Yoga
 * Extracts JWT token from Authorization header and adds user to context
 */
export async function createAuthContext(request: Request): Promise<GraphQLContext> {
  console.log('🔍 Backend Debug - createAuthContext called');
  const context: GraphQLContext = {
    request,
  };

  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization');
    console.log('🔍 Backend Debug - Authorization header present:', !!authHeader);
    
    const token = extractTokenFromHeader(authHeader ?? undefined);

    if (!token) {
      // No token provided - return context without user (public access)
      console.log('🔍 Backend Debug - No token extracted, returning public context');
      return context;
    }

    console.log('🔍 Backend Debug - Token extracted successfully');

    // Verify JWT token
    const payload = verifyToken(token);
    if (!payload) {
      // Invalid token - return context without user
      console.warn('🔍 Backend Debug - Invalid JWT token provided');
      return context;
    }

    console.log('🔍 Backend Debug - JWT verified, userId:', payload.userId);

    // Verify user still exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    console.log('🔍 Backend Debug - User lookup result:', {
      found: !!user,
      id: user?.id,
      email: user?.email,
      role: user?.role,
      isActive: user?.isActive
    });

    if (!user || !user.isActive) {
      // User not found or inactive - return context without user
      console.warn(`🔍 Backend Debug - User ${payload.userId} not found or inactive`);
      return context;
    }

    // Add authenticated user to context using fresh database data
    context.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };
    console.log('🔍 Backend Debug - User added to context with role:', context.user.role, 'from database');
    
  } catch (error) {
    // Log error but don't throw - allow request to continue without auth
    console.error('🔍 Backend Debug - Error in auth middleware:', error);
  }

  return context;
}

/**
 * Authentication Error Types
 */
export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Require Authentication Guard
 * Throws error if user is not authenticated
 */
export function requireAuth(context: GraphQLContext): asserts context is GraphQLContext & { user: NonNullable<GraphQLContext['user']> } {
  console.log('🔍 Backend Debug - requireAuth called, user present:', !!context.user);
  if (!context.user) {
    console.log('🔍 Backend Debug - Authentication failed - no user in context');
    throw new AuthenticationError('Authentication required');
  }
  console.log('🔍 Backend Debug - Authentication successful for user:', context.user.email, 'role:', context.user.role);
}

/**
 * Require Specific Role Guard
 * Throws error if user doesn't have required role
 */
export function requireRole(context: GraphQLContext, requiredRole: string | string[]): void {
  requireAuth(context);
  
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  console.log('🔍 Backend Debug - requireRole called, user role:', context.user.role, 'required roles:', roles);
  
  if (!roles.includes(context.user.role)) {
    console.log('🔍 Backend Debug - Authorization failed - user role:', context.user.role, 'required:', roles.join(' or '), 'userId:', context.user.id, 'userEmail:', context.user.email);
    throw new AuthorizationError(`Required role: ${roles.join(' or ')}`);
  }
  console.log('🔍 Backend Debug - Authorization successful for user:', context.user.email);
}

/**
 * Require Admin Role Guard
 */
export function requireAdmin(context: GraphQLContext): void {
  requireRole(context, 'ADMIN');
}

/**
 * Require Editor or Admin Role Guard
 */
export function requireEditor(context: GraphQLContext): void {
  requireRole(context, ['ADMIN', 'EDITOR']);
}

/**
 * Require Author, Editor, or Admin Role Guard
 */
export function requireAuthor(context: GraphQLContext): void {
  requireRole(context, ['ADMIN', 'EDITOR', 'AUTHOR']);
}

/**
 * Check if user owns resource or has elevated permissions
 */
export function requireOwnershipOrRole(
  context: GraphQLContext, 
  resourceUserId: string, 
  allowedRoles: string[] = ['ADMIN', 'EDITOR']
): void {
  requireAuth(context);
  
  // Allow if user owns the resource
  if (context.user.id === resourceUserId) {
    return;
  }
  
  // Allow if user has elevated role
  if (allowedRoles.includes(context.user.role)) {
    return;
  }
  
  throw new AuthorizationError('You can only access your own resources');
}

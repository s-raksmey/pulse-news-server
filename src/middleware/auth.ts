import { verifyToken, extractTokenFromHeader, createContextUser } from '../utils/jwt';
import { prisma } from '../lib/prisma';

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
  const context: GraphQLContext = {
    request,
  };

  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader ?? undefined);

    if (!token) {
      // No token provided - return context without user (public access)
      return context;
    }

    // Verify JWT token
    const payload = verifyToken(token);
    if (!payload) {
      // Invalid token - return context without user
      return context;
    }

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

    if (!user || !user.isActive) {
      // User not found or inactive - return context without user
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
  } catch (error) {
    // Log error but don't throw - allow request to continue without auth
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in auth middleware:', error);
    }
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
export function requireAuth(
  context: GraphQLContext
): asserts context is GraphQLContext & { user: NonNullable<GraphQLContext['user']> } {
  if (!context.user) {
    throw new AuthenticationError('Authentication required');
  }
}

/**
 * Require Specific Role Guard
 * Throws error if user doesn't have required role
 */
export function requireRole(context: GraphQLContext, requiredRole: string | string[]): void {
  requireAuth(context);

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  if (!roles.includes(context.user.role)) {
    throw new AuthorizationError(`Required role: ${roles.join(' or ')}`);
  }
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

/**
 * Require Preview Permission Guard (allows all authenticated users who have preview permission)
 * This allows ADMIN, EDITOR, and AUTHOR to preview articles
 */
export function requirePreview(context: GraphQLContext): void {
  requireRole(context, ['ADMIN', 'EDITOR', 'AUTHOR']);
}

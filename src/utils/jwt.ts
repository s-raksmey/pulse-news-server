import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

// JWT Secret - in production, this should be in environment variables
const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isActive: boolean;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: AuthUser): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any,
    issuer: 'pulse-news-server',
    audience: 'pulse-news-clients',
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'pulse-news-server',
      audience: 'pulse-news-clients',
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Create a context user from JWT payload
 */
export function createContextUser(payload: JWTPayload): AuthUser {
  return {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    isActive: true, // We assume active if token is valid
  };
}

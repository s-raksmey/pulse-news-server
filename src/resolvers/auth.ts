import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generateToken, AuthUser } from '../utils/jwt';
import { UserRole } from '@prisma/client';
import { AuditService, AuditEventType } from '../services/auditService';

// Input validation schemas
const RegisterInput = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['ADMIN', 'EDITOR', 'AUTHOR']).optional(),
});

const LoginInput = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Response types
export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    isActive: boolean;
    createdAt: string;
  };
}

/**
 * Register a new user
 */
export async function registerUser(
  args: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
  },
  request?: Request
): Promise<AuthResponse> {
  try {
    // Validate input
    const validatedInput = RegisterInput.parse(args);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedInput.email.toLowerCase() },
    });

    if (existingUser) {
      return {
        success: false,
        message: 'User with this email already exists',
      };
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(validatedInput.password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedInput.email.toLowerCase(),
        password: hashedPassword,
        name: validatedInput.name,
        role: validatedInput.role || 'AUTHOR',
        isActive: true,
      },
    });

    // Generate JWT token
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
    };

    const token = generateToken(authUser);

    // Log successful registration with request context for IP extraction
    await AuditService.logEvent({
      eventType: AuditEventType.USER_REGISTRATION,
      userId: user.id,
      success: true,
      details: {
        email: user.email,
        role: user.role,
      },
      ipAddress: AuditService.getClientIp(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });

    return {
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('Registration error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Registration failed. Please try again.',
    };
  }
}

/**
 * Login user
 */
export async function loginUser(
  args: {
    email: string;
    password: string;
  },
  request?: Request
): Promise<AuthResponse> {
  try {
    // Validate input
    const validatedInput = LoginInput.parse(args);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedInput.email.toLowerCase() },
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid email or password',
      };
    }

    // Check if user is active
    if (!user.isActive) {
      return {
        success: false,
        message: 'Account is deactivated. Please contact administrator.',
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(validatedInput.password, user.password);

    if (!isPasswordValid) {
      // Log failed login attempt with request context for IP extraction
      await AuditService.logEvent({
        eventType: AuditEventType.USER_LOGIN,
        userId: user.id,
        success: false,
        errorMessage: 'Invalid password',
        ipAddress: AuditService.getClientIp(request),
        userAgent: request?.headers.get('user-agent') || undefined,
      });

      return {
        success: false,
        message: 'Invalid email or password',
      };
    }

    // Generate JWT token
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
    };

    const token = generateToken(authUser);

    // Log successful login with request context for IP extraction
    await AuditService.logEvent({
      eventType: AuditEventType.USER_LOGIN,
      userId: user.id,
      success: true,
      details: {
        email: user.email,
      },
      ipAddress: AuditService.getClientIp(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });

    return {
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('Login error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Login failed. Please try again.',
    };
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUser(userId: string): Promise<AuthResponse> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      return {
        success: false,
        message: 'User not found or inactive',
      };
    }

    return {
      success: true,
      message: 'User profile retrieved successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error('Get current user error:', error);
    return {
      success: false,
      message: 'Failed to retrieve user profile',
    };
  }
}

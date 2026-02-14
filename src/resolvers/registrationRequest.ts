// src/resolvers/registrationRequest.ts
import { z } from 'zod';
import { RegistrationWorkflowService } from '../services/registrationWorkflowService';
import { AuditService } from '../services/auditService';
import { UserRole, RegistrationRequestStatus } from '@prisma/client';

// Input validation schemas
const SubmitRegistrationRequestInput = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  requestedRole: z.enum(['ADMIN', 'EDITOR', 'AUTHOR']).optional(),
});

const VerifyEmailInput = z.object({
  token: z.string().min(1, 'Verification token is required'),
  email: z.string().email('Invalid email format'),
});

const ReviewRegistrationInput = z.object({
  registrationId: z.string().min(1, 'Registration ID is required'),
  reviewNotes: z.string().optional(),
});

const ListRegistrationRequestsInput = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

// Response types
export interface RegistrationRequestResponse {
  success: boolean;
  message: string;
  registrationId?: string;
}

export interface EmailVerificationResponse {
  success: boolean;
  message: string;
  registrationRequest?: {
    id: string;
    email: string;
    name: string;
    status: RegistrationRequestStatus;
  };
}

export interface AdminReviewResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    isActive: boolean;
  };
}

export interface RegistrationRequestListResponse {
  success: boolean;
  message?: string;
  requests: Array<{
    id: string;
    email: string;
    name: string;
    requestedRole: UserRole;
    status: RegistrationRequestStatus;
    emailVerifiedAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNotes?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
    updatedAt: string;
    reviewer?: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  totalCount: number;
  hasMore: boolean;
}

export interface RegistrationStatsResponse {
  totalRequests: number;
  pendingVerification: number;
  pendingApproval: number;
  approved: number;
  rejected: number;
  expired: number;
}

/**
 * Submit a new registration request (public endpoint)
 */
export async function submitRegistrationRequest(
  args: {
    email: string;
    password: string;
    name: string;
    requestedRole?: UserRole;
  },
  request?: Request
): Promise<RegistrationRequestResponse> {
  try {
    // Validate input
    const validatedInput = SubmitRegistrationRequestInput.parse(args);

    // Extract client information
    const ipAddress = AuditService.getClientIp(request);
    const userAgent = request?.headers.get('user-agent') || undefined;

    // Submit registration request
    const result = await RegistrationWorkflowService.submitRegistrationRequest({
      email: validatedInput.email,
      password: validatedInput.password,
      name: validatedInput.name,
      requestedRole: validatedInput.requestedRole,
      ipAddress,
      userAgent,
    }, request);

    return {
      success: result.success,
      message: result.message,
      registrationId: result.registrationId,
    };
  } catch (error) {
    console.error('Submit registration request error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Failed to submit registration request. Please try again.',
    };
  }
}

/**
 * Verify email address (public endpoint)
 */
export async function verifyEmail(
  args: {
    token: string;
    email: string;
  }
): Promise<EmailVerificationResponse> {
  try {
    // Validate input
    const validatedInput = VerifyEmailInput.parse(args);

    // Verify email
    const result = await RegistrationWorkflowService.verifyEmail(
      validatedInput.token,
      validatedInput.email
    );

    return {
      success: result.success,
      message: result.message,
      registrationRequest: result.registrationRequest,
    };
  } catch (error) {
    console.error('Verify email error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Failed to verify email. Please try again.',
    };
  }
}

/**
 * List registration requests (admin only)
 */
export async function listRegistrationRequests(
  args: {
    status?: RegistrationRequestStatus;
    limit?: number;
    offset?: number;
  },
  context: { user?: { id: string; role: UserRole } }
): Promise<RegistrationRequestListResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Admin access required',
        requests: [],
        totalCount: 0,
        hasMore: false,
      };
    }

    // Validate input
    const validatedInput = ListRegistrationRequestsInput.parse(args);

    // Get registration requests
    const result = await RegistrationWorkflowService.getRegistrationRequests(
      validatedInput.status,
      validatedInput.limit || 50,
      validatedInput.offset || 0
    );

    if (!result.success) {
      return {
        success: false,
        message: result.message,
        requests: [],
        totalCount: 0,
        hasMore: false,
      };
    }

    // Format response
    const formattedRequests = result.requests.map((request) => ({
      id: request.id,
      email: request.email,
      name: request.name,
      requestedRole: request.requestedRole,
      status: request.status,
      emailVerifiedAt: request.emailVerifiedAt?.toISOString(),
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt?.toISOString(),
      reviewNotes: request.reviewNotes,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      reviewer: request.reviewer,
    }));

    return {
      success: true,
      requests: formattedRequests,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
    };
  } catch (error) {
    console.error('List registration requests error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
        requests: [],
        totalCount: 0,
        hasMore: false,
      };
    }

    return {
      success: false,
      message: 'Failed to fetch registration requests.',
      requests: [],
      totalCount: 0,
      hasMore: false,
    };
  }
}

/**
 * Approve registration request (admin only)
 */
export async function approveRegistrationRequest(
  args: {
    registrationId: string;
    reviewNotes?: string;
  },
  context: { user?: { id: string; role: UserRole } }
): Promise<AdminReviewResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Admin access required',
      };
    }

    // Validate input
    const validatedInput = ReviewRegistrationInput.parse(args);

    // Approve registration
    const result = await RegistrationWorkflowService.approveRegistration(
      validatedInput.registrationId,
      context.user.id,
      validatedInput.reviewNotes
    );

    return {
      success: result.success,
      message: result.message,
      user: result.user,
    };
  } catch (error) {
    console.error('Approve registration error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Failed to approve registration. Please try again.',
    };
  }
}

/**
 * Reject registration request (admin only)
 */
export async function rejectRegistrationRequest(
  args: {
    registrationId: string;
    reviewNotes?: string;
  },
  context: { user?: { id: string; role: UserRole } }
): Promise<AdminReviewResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Admin access required',
      };
    }

    // Validate input
    const validatedInput = ReviewRegistrationInput.parse(args);

    // Reject registration
    const result = await RegistrationWorkflowService.rejectRegistration(
      validatedInput.registrationId,
      context.user.id,
      validatedInput.reviewNotes
    );

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    console.error('Reject registration error:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors.map((e) => e.message).join(', '),
      };
    }

    return {
      success: false,
      message: 'Failed to reject registration. Please try again.',
    };
  }
}

/**
 * Get registration statistics (admin only)
 */
export async function getRegistrationStats(
  context: { user?: { id: string; role: UserRole } }
): Promise<RegistrationStatsResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }

    // Get statistics
    const stats = await RegistrationWorkflowService.getRegistrationStats();

    return stats;
  } catch (error) {
    console.error('Get registration stats error:', error);
    return {
      totalRequests: 0,
      pendingVerification: 0,
      pendingApproval: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
    };
  }
}

/**
 * Bulk approve registration requests (admin only)
 */
export async function bulkApproveRegistrationRequests(
  args: {
    registrationIds: string[];
    reviewNotes?: string;
  },
  context: { user?: { id: string; role: UserRole } }
): Promise<AdminReviewResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Admin access required',
      };
    }

    if (!args.registrationIds || args.registrationIds.length === 0) {
      return {
        success: false,
        message: 'No registration IDs provided',
      };
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each registration request
    for (const registrationId of args.registrationIds) {
      try {
        const result = await RegistrationWorkflowService.approveRegistration(
          registrationId,
          context.user.id,
          args.reviewNotes
        );

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${registrationId}: ${result.message}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${registrationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const message = `Bulk approval completed. ${successCount} approved, ${errorCount} failed.`;
    
    return {
      success: successCount > 0,
      message: errors.length > 0 ? `${message} Errors: ${errors.join('; ')}` : message,
    };
  } catch (error) {
    console.error('Bulk approve registrations error:', error);
    return {
      success: false,
      message: 'Failed to process bulk approval. Please try again.',
    };
  }
}

/**
 * Bulk reject registration requests (admin only)
 */
export async function bulkRejectRegistrationRequests(
  args: {
    registrationIds: string[];
    reviewNotes?: string;
  },
  context: { user?: { id: string; role: UserRole } }
): Promise<AdminReviewResponse> {
  try {
    // Check admin permission
    if (!context.user || context.user.role !== 'ADMIN') {
      return {
        success: false,
        message: 'Admin access required',
      };
    }

    if (!args.registrationIds || args.registrationIds.length === 0) {
      return {
        success: false,
        message: 'No registration IDs provided',
      };
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each registration request
    for (const registrationId of args.registrationIds) {
      try {
        const result = await RegistrationWorkflowService.rejectRegistration(
          registrationId,
          context.user.id,
          args.reviewNotes
        );

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${registrationId}: ${result.message}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${registrationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const message = `Bulk rejection completed. ${successCount} rejected, ${errorCount} failed.`;
    
    return {
      success: successCount > 0,
      message: errors.length > 0 ? `${message} Errors: ${errors.join('; ')}` : message,
    };
  } catch (error) {
    console.error('Bulk reject registrations error:', error);
    return {
      success: false,
      message: 'Failed to process bulk rejection. Please try again.',
    };
  }
}

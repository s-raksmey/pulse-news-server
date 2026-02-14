// src/services/registrationWorkflowService.ts
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { EmailService } from './emailService';
import { AuditService, AuditEventType } from './auditService';
import { UserRole, RegistrationRequestStatus } from '@prisma/client';

export interface RegistrationRequestInput {
  email: string;
  password: string;
  name: string;
  requestedRole?: UserRole;
  ipAddress?: string;
  userAgent?: string;
}

export interface RegistrationRequestResult {
  success: boolean;
  message: string;
  registrationId?: string;
}

export interface EmailVerificationResult {
  success: boolean;
  message: string;
  registrationRequest?: {
    id: string;
    email: string;
    name: string;
    status: RegistrationRequestStatus;
  };
}

export interface AdminReviewResult {
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

export class RegistrationWorkflowService {
  private static readonly VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
  private static readonly SALT_ROUNDS = 12;

  /**
   * Step 1: Submit registration request
   */
  static async submitRegistrationRequest(
    input: RegistrationRequestInput,
    request?: Request
  ): Promise<RegistrationRequestResult> {
    try {
      // Validate input
      if (!input.email || !input.password || !input.name) {
        return {
          success: false,
          message: 'Email, password, and name are required',
        };
      }

      // Check if email is already registered as a user
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      if (existingUser) {
        return {
          success: false,
          message: 'An account with this email already exists',
        };
      }

      // Check if there's already a pending registration for this email
      const existingRequest = await prisma.registrationRequest.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      if (existingRequest) {
        // If the existing request is expired, delete it and allow new registration
        if (existingRequest.status === 'EXPIRED' || 
            (existingRequest.verificationTokenExpiry && 
             existingRequest.verificationTokenExpiry < new Date())) {
          await prisma.registrationRequest.delete({
            where: { id: existingRequest.id },
          });
        } else {
          return {
            success: false,
            message: 'A registration request for this email is already pending',
          };
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, this.SALT_ROUNDS);

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date();
      verificationTokenExpiry.setHours(
        verificationTokenExpiry.getHours() + this.VERIFICATION_TOKEN_EXPIRY_HOURS
      );

      // Create registration request
      const registrationRequest = await prisma.registrationRequest.create({
        data: {
          email: input.email.toLowerCase(),
          password: hashedPassword,
          name: input.name,
          requestedRole: input.requestedRole || 'AUTHOR',
          status: 'PENDING_VERIFICATION',
          verificationToken,
          verificationTokenExpiry,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });

      // Send verification email
      const baseUrl = await EmailService.getBaseUrl();
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(input.email)}`;

      await EmailService.sendEmailVerification({
        name: input.name,
        verificationUrl,
        expiryHours: this.VERIFICATION_TOKEN_EXPIRY_HOURS,
      });

      // Log the registration request
      await AuditService.logEvent({
        eventType: AuditEventType.USER_REGISTRATION,
        userId: null,
        success: true,
        details: {
          email: input.email,
          name: input.name,
          requestedRole: input.requestedRole || 'AUTHOR',
          registrationId: registrationRequest.id,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      return {
        success: true,
        message: 'Registration request submitted successfully. Please check your email to verify your address.',
        registrationId: registrationRequest.id,
      };
    } catch (error) {
      console.error('Registration request error:', error);
      return {
        success: false,
        message: 'Failed to submit registration request. Please try again.',
      };
    }
  }

  /**
   * Step 2: Verify email address
   */
  static async verifyEmail(token: string, email: string): Promise<EmailVerificationResult> {
    try {
      // Find registration request by token and email
      const registrationRequest = await prisma.registrationRequest.findFirst({
        where: {
          verificationToken: token,
          email: email.toLowerCase(),
          status: 'PENDING_VERIFICATION',
        },
      });

      if (!registrationRequest) {
        return {
          success: false,
          message: 'Invalid or expired verification link',
        };
      }

      // Check if token is expired
      if (registrationRequest.verificationTokenExpiry && 
          registrationRequest.verificationTokenExpiry < new Date()) {
        // Mark as expired
        await prisma.registrationRequest.update({
          where: { id: registrationRequest.id },
          data: { status: 'EXPIRED' },
        });

        return {
          success: false,
          message: 'Verification link has expired. Please register again.',
        };
      }

      // Update registration request status
      const updatedRequest = await prisma.registrationRequest.update({
        where: { id: registrationRequest.id },
        data: {
          status: 'PENDING_APPROVAL',
          emailVerifiedAt: new Date(),
          verificationToken: null, // Clear the token after use
          verificationTokenExpiry: null,
        },
      });

      // Send confirmation email
      await EmailService.sendRegistrationReceived(email, {
        name: registrationRequest.name,
        email: registrationRequest.email,
      });

      // Log the email verification
      await AuditService.logEvent({
        eventType: AuditEventType.USER_REGISTRATION,
        userId: null,
        success: true,
        details: {
          email: registrationRequest.email,
          action: 'email_verified',
          registrationId: registrationRequest.id,
        },
      });

      return {
        success: true,
        message: 'Email verified successfully. Your registration is now pending admin approval.',
        registrationRequest: {
          id: updatedRequest.id,
          email: updatedRequest.email,
          name: updatedRequest.name,
          status: updatedRequest.status,
        },
      };
    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'Failed to verify email. Please try again.',
      };
    }
  }

  /**
   * Step 3: Admin approves registration
   */
  static async approveRegistration(
    registrationId: string,
    reviewerId: string,
    reviewNotes?: string
  ): Promise<AdminReviewResult> {
    try {
      // Find the registration request
      const registrationRequest = await prisma.registrationRequest.findUnique({
        where: { id: registrationId },
      });

      if (!registrationRequest) {
        return {
          success: false,
          message: 'Registration request not found',
        };
      }

      if (registrationRequest.status !== 'PENDING_APPROVAL') {
        return {
          success: false,
          message: 'Registration request is not pending approval',
        };
      }

      // Check if user with this email already exists (race condition check)
      const existingUser = await prisma.user.findUnique({
        where: { email: registrationRequest.email },
      });

      if (existingUser) {
        // Mark registration as rejected since user already exists
        await prisma.registrationRequest.update({
          where: { id: registrationId },
          data: {
            status: 'REJECTED',
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reviewNotes: 'User with this email already exists',
          },
        });

        return {
          success: false,
          message: 'A user with this email already exists',
        };
      }

      // Create the user account
      const user = await prisma.user.create({
        data: {
          email: registrationRequest.email,
          password: registrationRequest.password,
          name: registrationRequest.name,
          role: registrationRequest.requestedRole,
          isActive: true,
        },
      });

      // Update registration request status
      await prisma.registrationRequest.update({
        where: { id: registrationId },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });

      // Send approval email
      const baseUrl = await EmailService.getBaseUrl();
      const loginUrl = `${baseUrl}/login`;

      await EmailService.sendRegistrationApproved(registrationRequest.email, {
        name: registrationRequest.name,
        email: registrationRequest.email,
        loginUrl,
        role: registrationRequest.requestedRole,
      });

      // Log the approval
      await AuditService.logEvent({
        eventType: AuditEventType.USER_REGISTRATION,
        userId: user.id,
        success: true,
        details: {
          email: registrationRequest.email,
          action: 'approved',
          registrationId: registrationRequest.id,
          reviewerId,
          reviewNotes,
        },
      });

      return {
        success: true,
        message: 'Registration approved successfully. User account created.',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        },
      };
    } catch (error) {
      console.error('Registration approval error:', error);
      return {
        success: false,
        message: 'Failed to approve registration. Please try again.',
      };
    }
  }

  /**
   * Step 3 (Alternative): Admin rejects registration
   */
  static async rejectRegistration(
    registrationId: string,
    reviewerId: string,
    reviewNotes?: string
  ): Promise<AdminReviewResult> {
    try {
      // Find the registration request
      const registrationRequest = await prisma.registrationRequest.findUnique({
        where: { id: registrationId },
      });

      if (!registrationRequest) {
        return {
          success: false,
          message: 'Registration request not found',
        };
      }

      if (registrationRequest.status !== 'PENDING_APPROVAL') {
        return {
          success: false,
          message: 'Registration request is not pending approval',
        };
      }

      // Update registration request status
      await prisma.registrationRequest.update({
        where: { id: registrationId },
        data: {
          status: 'REJECTED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
        },
      });

      // Send rejection email
      const supportEmail = await EmailService.getSupportEmail();

      await EmailService.sendRegistrationRejected(registrationRequest.email, {
        name: registrationRequest.name,
        reason: reviewNotes,
        supportEmail,
      });

      // Log the rejection
      await AuditService.logEvent({
        eventType: AuditEventType.USER_REGISTRATION,
        userId: null,
        success: true,
        details: {
          email: registrationRequest.email,
          action: 'rejected',
          registrationId: registrationRequest.id,
          reviewerId,
          reviewNotes,
        },
      });

      return {
        success: true,
        message: 'Registration rejected successfully.',
      };
    } catch (error) {
      console.error('Registration rejection error:', error);
      return {
        success: false,
        message: 'Failed to reject registration. Please try again.',
      };
    }
  }

  /**
   * Get registration requests for admin review
   */
  static async getRegistrationRequests(
    status?: RegistrationRequestStatus,
    limit: number = 50,
    offset: number = 0
  ) {
    try {
      const where = status ? { status } : {};

      const [requests, totalCount] = await Promise.all([
        prisma.registrationRequest.findMany({
          where,
          include: {
            reviewer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.registrationRequest.count({ where }),
      ]);

      return {
        success: true,
        requests,
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    } catch (error) {
      console.error('Get registration requests error:', error);
      return {
        success: false,
        message: 'Failed to fetch registration requests',
        requests: [],
        totalCount: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Cleanup expired registration requests
   */
  static async cleanupExpiredRequests(): Promise<number> {
    try {
      const result = await prisma.registrationRequest.deleteMany({
        where: {
          OR: [
            {
              status: 'PENDING_VERIFICATION',
              verificationTokenExpiry: {
                lt: new Date(),
              },
            },
            {
              status: 'EXPIRED',
            },
          ],
        },
      });

      console.log(`Cleaned up ${result.count} expired registration requests`);
      return result.count;
    } catch (error) {
      console.error('Cleanup expired requests error:', error);
      return 0;
    }
  }

  /**
   * Get registration statistics
   */
  static async getRegistrationStats() {
    try {
      const [
        totalRequests,
        pendingVerification,
        pendingApproval,
        approved,
        rejected,
        expired,
      ] = await Promise.all([
        prisma.registrationRequest.count(),
        prisma.registrationRequest.count({ where: { status: 'PENDING_VERIFICATION' } }),
        prisma.registrationRequest.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.registrationRequest.count({ where: { status: 'APPROVED' } }),
        prisma.registrationRequest.count({ where: { status: 'REJECTED' } }),
        prisma.registrationRequest.count({ where: { status: 'EXPIRED' } }),
      ]);

      return {
        totalRequests,
        pendingVerification,
        pendingApproval,
        approved,
        rejected,
        expired,
      };
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
}

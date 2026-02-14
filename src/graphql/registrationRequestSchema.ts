// src/graphql/registrationRequestSchema.ts
import {
  submitRegistrationRequest,
  verifyEmail,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  getRegistrationStats,
  bulkApproveRegistrationRequests,
  bulkRejectRegistrationRequests,
} from '../resolvers/registrationRequest';
import { GraphQLContext, requireAdmin } from '../middleware/auth';

export const registrationRequestTypeDefs = `
  enum RegistrationRequestStatus {
    PENDING_VERIFICATION
    PENDING_APPROVAL
    APPROVED
    REJECTED
    EXPIRED
  }

  type RegistrationRequest {
    id: ID!
    email: String!
    name: String!
    requestedRole: UserRole!
    status: RegistrationRequestStatus!
    emailVerifiedAt: String
    reviewedBy: String
    reviewedAt: String
    reviewNotes: String
    ipAddress: String
    userAgent: String
    createdAt: String!
    updatedAt: String!
    reviewer: User
  }

  type RegistrationRequestResponse {
    success: Boolean!
    message: String!
    registrationId: String
  }

  type EmailVerificationResponse {
    success: Boolean!
    message: String!
    registrationRequest: RegistrationRequestBasic
  }

  type RegistrationRequestBasic {
    id: ID!
    email: String!
    name: String!
    status: RegistrationRequestStatus!
  }

  type AdminReviewResponse {
    success: Boolean!
    message: String!
    user: User
  }

  type RegistrationRequestListResponse {
    success: Boolean!
    message: String
    requests: [RegistrationRequest!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  type RegistrationStatsResponse {
    totalRequests: Int!
    pendingVerification: Int!
    pendingApproval: Int!
    approved: Int!
    rejected: Int!
    expired: Int!
  }

  input SubmitRegistrationRequestInput {
    email: String!
    password: String!
    name: String!
    requestedRole: UserRole
  }

  input VerifyEmailInput {
    token: String!
    email: String!
  }

  input ListRegistrationRequestsInput {
    status: RegistrationRequestStatus
    limit: Int
    offset: Int
  }

  input ReviewRegistrationInput {
    registrationId: ID!
    reviewNotes: String
  }

  input BulkReviewRegistrationInput {
    registrationIds: [ID!]!
    reviewNotes: String
  }

  extend type Query {
    # Admin only - list registration requests
    listRegistrationRequests(input: ListRegistrationRequestsInput): RegistrationRequestListResponse!
    
    # Admin only - get registration statistics
    getRegistrationStats: RegistrationStatsResponse!
  }

  extend type Mutation {
    # Public - submit registration request
    submitRegistrationRequest(input: SubmitRegistrationRequestInput!): RegistrationRequestResponse!
    
    # Public - verify email address
    verifyEmail(input: VerifyEmailInput!): EmailVerificationResponse!
    
    # Admin only - approve registration request
    approveRegistrationRequest(input: ReviewRegistrationInput!): AdminReviewResponse!
    
    # Admin only - reject registration request
    rejectRegistrationRequest(input: ReviewRegistrationInput!): AdminReviewResponse!
    
    # Admin only - bulk approve registration requests
    bulkApproveRegistrationRequests(input: BulkReviewRegistrationInput!): AdminReviewResponse!
    
    # Admin only - bulk reject registration requests
    bulkRejectRegistrationRequests(input: BulkReviewRegistrationInput!): AdminReviewResponse!
  }
`;

export const registrationRequestResolvers = {
  Query: {
    listRegistrationRequests: async (
      _: unknown,
      { input }: { input?: { status?: string; limit?: number; offset?: number } },
      context: GraphQLContext
    ) => {
      return await listRegistrationRequests(
        {
          status: input?.status as any,
          limit: input?.limit,
          offset: input?.offset,
        },
        context
      );
    },

    getRegistrationStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
      return await getRegistrationStats(context);
    },
  },

  Mutation: {
    submitRegistrationRequest: async (
      _: unknown,
      { input }: { input: { email: string; password: string; name: string; requestedRole?: string } },
      context: GraphQLContext
    ) => {
      return await submitRegistrationRequest(
        {
          email: input.email,
          password: input.password,
          name: input.name,
          requestedRole: input.requestedRole as any,
        },
        context.request
      );
    },

    verifyEmail: async (
      _: unknown,
      { input }: { input: { token: string; email: string } }
    ) => {
      return await verifyEmail({
        token: input.token,
        email: input.email,
      });
    },

    approveRegistrationRequest: async (
      _: unknown,
      { input }: { input: { registrationId: string; reviewNotes?: string } },
      context: GraphQLContext
    ) => {
      return await approveRegistrationRequest(
        {
          registrationId: input.registrationId,
          reviewNotes: input.reviewNotes,
        },
        context
      );
    },

    rejectRegistrationRequest: async (
      _: unknown,
      { input }: { input: { registrationId: string; reviewNotes?: string } },
      context: GraphQLContext
    ) => {
      return await rejectRegistrationRequest(
        {
          registrationId: input.registrationId,
          reviewNotes: input.reviewNotes,
        },
        context
      );
    },

    bulkApproveRegistrationRequests: async (
      _: unknown,
      { input }: { input: { registrationIds: string[]; reviewNotes?: string } },
      context: GraphQLContext
    ) => {
      return await bulkApproveRegistrationRequests(
        {
          registrationIds: input.registrationIds,
          reviewNotes: input.reviewNotes,
        },
        context
      );
    },

    bulkRejectRegistrationRequests: async (
      _: unknown,
      { input }: { input: { registrationIds: string[]; reviewNotes?: string } },
      context: GraphQLContext
    ) => {
      return await bulkRejectRegistrationRequests(
        {
          registrationIds: input.registrationIds,
          reviewNotes: input.reviewNotes,
        },
        context
      );
    },
  },
};

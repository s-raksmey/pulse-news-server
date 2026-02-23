/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSchema } from 'graphql-yoga';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-scalars';
import { z } from 'zod';
import { registerUser, loginUser, getCurrentUser } from '../resolvers/auth';
import { debugArticles } from '../resolvers/debug';
import {
  GraphQLContext,
  requireAuth,
  requireEditor,
  requireAdmin,
  requirePreview,
  AuthenticationError,
  AuthorizationError,
} from '../middleware/auth';

import { searchArticles, getSearchSuggestions } from '../services/searchService';
import { getRelatedArticles } from '../services/relatedArticlesService';
import { getSettingConfig } from '../data/settings-config';
import { registrationRequestTypeDefs, registrationRequestResolvers } from './registrationRequestSchema';
import { debugCreateCategory } from '../debug/category-debug';

/**
 * IMPORTANT:
 * Your Prisma schema already contains:
 * - ArticleStatus: DRAFT | REVIEW | PUBLISHED | ARCHIVED
 * - Article fields: isFeatured, isEditorsPick, pinnedAt, viewCount
 * - Tag model
 * - ArticleTag join model
 *
 * But your TypeScript still reports those properties don't exist.
 * This file binds prisma to `any` ONLY inside GraphQL layer to avoid stale typings.
 */
const db = prisma as any;

/* =========================
   Validation
========================= */
const ArticleInput = z.object({
  title: z.string().min(3),
  slug: z.string().min(3),
  excerpt: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
  categorySlug: z.string().optional().nullable(),
  topic: z.string().optional().nullable(),
  contentJson: z.any().optional(),

  isFeatured: z.boolean().optional(),
  isEditorsPick: z.boolean().optional(),
  isBreaking: z.boolean().optional(),
  authorName: z.string().optional().nullable(),
  coverImageUrl: z.string().optional().nullable(),

  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  ogImageUrl: z.string().optional().nullable(),

  tagSlugs: z.array(z.string()).optional(),
  pinnedAt: z.string().optional().nullable(),
});

const TopicInput = z.object({
  categorySlug: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  coverVideoUrl: z.string().optional().nullable(),
});

const RevisionChangesInput = z
  .object({
    title: z.string().min(3).optional(),
    excerpt: z.string().optional().nullable(),
    topic: z.string().optional().nullable(),
    contentJson: z.any().optional(),
    coverImageUrl: z.string().optional().nullable(),
    seoTitle: z.string().optional().nullable(),
    seoDescription: z.string().optional().nullable(),
    ogImageUrl: z.string().optional().nullable(),
    categorySlug: z.string().optional().nullable(),
    tagSlugs: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional(),
    isEditorsPick: z.boolean().optional(),
    isBreaking: z.boolean().optional(),
    pinnedAt: z.string().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one change is required',
  });

const RevisionRequestInput = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  note: z.string().optional().nullable(),
  changes: RevisionChangesInput,
});

function toIso(d?: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function normalizeTagSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function normalizeRevisionChanges(changes: z.infer<typeof RevisionChangesInput>) {
  if (!changes.tagSlugs) return changes;

  const unique = Array.from(
    new Set(changes.tagSlugs.map(normalizeTagSlug).filter(Boolean))
  );

  return {
    ...changes,
    tagSlugs: unique,
  };
}

type RevisionNotificationAction =
  | 'REVISION_REQUESTED'
  | 'REVISION_APPROVED'
  | 'REVISION_REJECTED'
  | 'REVISION_CONSUMED';

type RevisionNotificationParams = {
  action: RevisionNotificationAction;
  articleId: string;
  articleTitle: string;
  requestId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  performedById: string;
  requesterId?: string | null;
  reviewerId?: string | null;
  consumedById?: string | null;
  authorId?: string | null;
  note?: string | null;
  reviewComment?: string | null;
  message?: string | null;
};

function getRevisionNotificationTitle(action: RevisionNotificationAction, articleTitle: string) {
  switch (action) {
    case 'REVISION_REQUESTED':
      return `Revision requested: ${articleTitle}`;
    case 'REVISION_APPROVED':
      return `Revision approved: ${articleTitle}`;
    case 'REVISION_REJECTED':
      return `Revision rejected: ${articleTitle}`;
    case 'REVISION_CONSUMED':
      return `Revision request completed: ${articleTitle}`;
    default:
      return `Revision update: ${articleTitle}`;
  }
}

async function sendRevisionNotifications(params: RevisionNotificationParams): Promise<void> {
  const { NotificationService } = await import('../services/notificationService');

  const directIds = new Set<string>();
  if (params.authorId) directIds.add(params.authorId);
  if (params.requesterId) directIds.add(params.requesterId);
  if (params.reviewerId) directIds.add(params.reviewerId);
  if (params.consumedById) directIds.add(params.consumedById);

  const [directUsers, adminEditors] = await Promise.all([
    directIds.size
      ? db.user.findMany({
          where: { id: { in: Array.from(directIds) } },
          select: { id: true, email: true, name: true },
        })
      : [],
    db.user.findMany({
      where: {
        role: { in: ['ADMIN', 'EDITOR'] },
        isActive: true,
      },
      select: { id: true, email: true, name: true },
    }),
  ]);

  const recipientMap = new Map<string, { id: string; email?: string | null; name?: string | null }>();
  for (const user of directUsers) recipientMap.set(user.id, user);
  for (const user of adminEditors) recipientMap.set(user.id, user);

  if (recipientMap.size === 0) return;

  const metadata = {
    action: params.action,
    articleTitle: params.articleTitle,
    requestId: params.requestId,
    requestStatus: params.status,
    requesterId: params.requesterId ?? undefined,
    reviewerId: params.reviewerId ?? undefined,
    consumedById: params.consumedById ?? undefined,
    note: params.note ?? undefined,
    reviewComment: params.reviewComment ?? undefined,
  };

  const notifications = Array.from(recipientMap.values()).map((recipient) => ({
    type: params.action,
    title: getRevisionNotificationTitle(params.action, params.articleTitle),
    message: params.message ?? undefined,
    metadata,
    articleId: params.articleId,
    fromUserId: params.performedById,
    toUserId: recipient.id,
    toUserEmail: recipient.email ?? undefined,
    toUserName: recipient.name ?? undefined,
  }));

  await NotificationService.createAndDispatch(notifications);
}

let breakingColumnAvailable: boolean | null = null;

async function hasBreakingColumn(): Promise<boolean> {
  if (breakingColumnAvailable !== null) return breakingColumnAvailable;

  try {
    const rows = await prisma.$queryRaw<{ exists: number }[]>`
      SELECT 1 as exists
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Article'
        AND column_name = 'isBreaking'
      LIMIT 1;
    `;
    const columnExists = rows.length > 0;

    if (!columnExists) {
      try {
        await prisma.$executeRaw`
          ALTER TABLE "Article"
          ADD COLUMN IF NOT EXISTS "isBreaking" BOOLEAN NOT NULL DEFAULT false;
        `;
        breakingColumnAvailable = true;
        return true;
      } catch (error) {
        console.warn('Failed to add Article.isBreaking column automatically.', error);
        breakingColumnAvailable = false;
        return false;
      }
    }

    breakingColumnAvailable = true;
  } catch (error) {
    console.warn('Failed to check for Article.isBreaking column.', error);
    breakingColumnAvailable = false;
  }

  return breakingColumnAvailable;
}

async function getArticleSelect() {
  const includeBreaking = await hasBreakingColumn();

  return {
    id: true,
    title: true,
    slug: true,
    excerpt: true,
    status: true,
    topic: true,
    contentJson: true,
    coverImageUrl: true,
    authorName: true,
    seoTitle: true,
    seoDescription: true,
    ogImageUrl: true,
    isFeatured: true,
    isEditorsPick: true,
    ...(includeBreaking ? { isBreaking: true } : {}),
    pinnedAt: true,
    viewCount: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    revisionStatus: true,
    revisionRequestedAt: true,
    breakingNewsRequestStatus: true,
    breakingNewsRequestedAt: true,
    breakingNewsRequestedById: true,
    categoryId: true,
    category: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    author: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    },
  };
}

/* =========================
   GraphQL Schema
========================= */
// Account Request Types
// Removed unused AccountRequestStatus and AccountRequestGraphQL to fix TS errors
// Removed unused AccountRequestStatus and AccountRequestGraphQL to fix TS errors

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
      type AccountRequest {
        id: ID!
        email: String!
        requesterName: String!
        requestedRole: UserRole!
        status: String!
        customMessage: String
        createdAt: String!
        updatedAt: String!
        userId: String
      }

      input AccountRequestInput {
        email: String!
        requesterName: String!
        requestedRole: UserRole!
      }

      type AccountRequestResult {
        success: Boolean!
        message: String!
        request: AccountRequest
      }

    scalar JSON

    enum ArticleStatus {
      DRAFT
      REVIEW
      PUBLISHED
      ARCHIVED
    }

    enum ArticleRevisionStatus {
      NONE
      REQUESTED
    }

    enum RevisionRequestStatus {
      PENDING
      APPROVED
      REJECTED
    }

    enum BreakingNewsRequestStatus {
      NONE
      PENDING
      APPROVED
      REJECTED
    }

    enum SettingType {
      SITE
      EMAIL
      SEO
      CONTENT
      USER_MANAGEMENT
      API
      THEME
      MAINTENANCE
    }

    type Category {
      id: ID!
      name: String!
      slug: String!
      createdAt: String!
      updatedAt: String!
    }

    type Tag {
      id: ID!
      name: String!
      slug: String!
      createdAt: String!
    }

    type Article {
      id: ID!
      title: String!
      slug: String!
      excerpt: String
      status: ArticleStatus!
      topic: String
      contentJson: JSON

      coverImageUrl: String
      authorName: String
      seoTitle: String
      seoDescription: String
      ogImageUrl: String

      isFeatured: Boolean
      isEditorsPick: Boolean
      isBreaking: Boolean
      pinnedAt: String
      viewCount: Int

      revisionStatus: ArticleRevisionStatus!
      revisionRequestedAt: String

      breakingNewsRequestStatus: BreakingNewsRequestStatus!
      breakingNewsRequestedAt: String
      breakingNewsRequestedBy: User

      publishedAt: String
      createdAt: String!
      updatedAt: String!

      category: Category
      author: User
      tags: [Tag!]
    }

    type ArticleRevisionRequest {
      id: ID!
      status: RevisionRequestStatus!
      note: String
      proposedChanges: JSON!
      reviewComment: String
      reviewedAt: String
      consumedAt: String
      createdAt: String!
      updatedAt: String!
      article: Article!
      requester: User!
      reviewedBy: User
      consumedBy: User
    }

    type ArticleRevision {
      id: ID!
      summary: String
      changes: JSON!
      appliedAt: String!
      article: Article!
      revisionRequest: ArticleRevisionRequest
      appliedBy: User!
    }

    type BreakingNewsRequest {
      id: ID!
      status: BreakingNewsRequestStatus!
      reason: String
      reviewComment: String
      reviewedAt: String
      createdAt: String!
      updatedAt: String!
      article: Article!
      requester: User!
      reviewedBy: User
    }

    enum UserRole {
      ADMIN
      EDITOR
      AUTHOR
    }

    type User {
      id: ID!
      email: String!
      name: String!
      role: UserRole!
      isActive: Boolean!
      createdAt: String!
    }

    type Setting {
      id: ID!
      key: String!
      value: JSON!
      type: SettingType!
      label: String!
      description: String
      isPublic: Boolean!
      isRequired: Boolean!
      createdAt: String!
      updatedAt: String!
    }

    type AuthResponse {
      success: Boolean!
      message: String!
      token: String
      user: User
    }

    type DebugAuthResponse {
      success: Boolean!
      message: String!
      debug: DebugAuthDebugInfo
    }

    type DebugAuthDebugInfo {
      hasContext: Boolean
      hasUser: Boolean
      timestamp: String!
      user: DebugUserInfo
      permissions: DebugPermissionInfo
      error: String
    }

    type DebugUserInfo {
      id: ID!
      email: String!
      name: String!
      role: UserRole!
      isActive: Boolean!
    }

    type DebugPermissionInfo {
      CREATE_ARTICLE: Boolean!
      UPDATE_ANY_ARTICLE: Boolean!
    }

    # Workflow and Permission Types
    enum WorkflowAction {
      SAVE_DRAFT
      SUBMIT_FOR_REVIEW
      APPROVE
      REJECT
      PUBLISH
      UNPUBLISH
      ARCHIVE
    }

    type WorkflowActionResult {
      success: Boolean!
      message: String!
      article: Article
    }

    type BulkWorkflowActionResult {
      success: Boolean!
      message: String!
      processedCount: Int!
      failedCount: Int!
      results: [WorkflowActionItemResult!]!
    }

    type WorkflowActionItemResult {
      articleId: ID!
      success: Boolean!
      message: String!
    }

    type ReviewQueue {
      articles: [Article!]!
      totalCount: Int!
      hasMore: Boolean!
    }

    type WorkflowStats {
      articlesInReview: Int!
      articlesPublishedToday: Int!
      articlesRejectedToday: Int!
      averageReviewTime: Float!
      topAuthors: [AuthorStats!]!
    }

    type AuthorStats {
      name: String!
      articlesSubmitted: Int!
    }

    type PermissionSummary {
      role: String!
      permissions: [String!]!
      description: String!
    }

    enum NotificationType {
      SUBMISSION
      APPROVAL
      REJECTION
      PUBLICATION
      UNPUBLICATION
      ARCHIVE
      DRAFT_SAVED
      REVISION_REQUESTED
      REVISION_APPROVED
      REVISION_REJECTED
      REVISION_CONSUMED
      ACCOUNT_REQUEST
    }

    type Notification {
      id: ID!
      type: NotificationType!
      title: String!
      message: String
      metadata: JSON
      articleId: String
      fromUserId: String
      fromUser: User
      toUserId: String!
      isRead: Boolean!
      readAt: String
      createdAt: String!
      updatedAt: String!
    }

    type NotificationConnection {
      notifications: [Notification!]!
      totalCount: Int!
      hasMore: Boolean!
    }

    # Audit Log Types
    type AuditLog {
      id: ID!
      eventType: String!

      # User Information
      userId: String
      userEmail: String
      targetUserId: String
      targetUserEmail: String

      # Resource Information
      resourceId: String
      resourceType: String
      resourceName: String

      # Request Information
      ipAddress: String
      userAgent: String

      # Event Status
      success: Boolean!
      errorMessage: String

      # Timing
      createdAt: String!

      # Details
      details: JSON

      # Computed Fields
      action: String!
      description: String!
    }

    type AuditLogConnection {
      logs: [AuditLog!]!
      totalCount: Int!
      hasMore: Boolean!
    }

    type AuditStats {
      totalEvents: Int!
      eventsByType: JSON!
      securityEvents: Int!
      userActivity: Int!
    }

    input AuditLogFilters {
      userId: String
      eventType: String
      resourceId: String
      resourceType: String
      startDate: String
      endDate: String
      limit: Int = 100
      offset: Int = 0
    }

    enum AuditTimeframe {
      day
      week
      month
    }

    input WorkflowActionInput {
      articleId: ID!
      action: WorkflowAction!
      reason: String
      notifyAuthor: Boolean = true
    }

    input BulkWorkflowActionInput {
      articleIds: [ID!]!
      action: WorkflowAction!
      reason: String
      notifyAuthors: Boolean = true
    }

    input ReviewQueueFilters {
      categoryId: ID
      authorId: ID
      limit: Int = 20
      offset: Int = 0
    }

    input RegisterInput {
      email: String!
      password: String!
      name: String!
      role: UserRole
    }

    input LoginInput {
      email: String!
      password: String!
    }

    input UpsertArticleInput {
      title: String!
      slug: String!
      excerpt: String
      status: ArticleStatus
      categorySlug: String
      topic: String
      contentJson: JSON

      isFeatured: Boolean
      isEditorsPick: Boolean
      isBreaking: Boolean
      pinnedAt: String

      authorName: String
      coverImageUrl: String
      seoTitle: String
      seoDescription: String
      ogImageUrl: String

      tagSlugs: [String!]
    }

    type Query {
        accountRequests(status: String): [AccountRequest!]!
      # Authentication queries
      me: AuthResponse!
      debugAuth: DebugAuthResponse!
      debugArticles: DebugAuthResponse!

      # Content queries
      categories: [Category!]!
      topics: [Topic!]!

      articles(
        status: ArticleStatus
        categorySlug: String
        topic: String
        authorId: ID
        take: Int = 20
        skip: Int = 0
      ): [Article!]!

      articleBySlug(slug: String!): Article
      articleById(id: ID!): Article
      articlesByTopic(categorySlug: String!, topicSlug: String!): [Article!]!

      topStories(limit: Int = 6): [Article!]!
      editorsPicks(limit: Int = 6): [Article!]!
      breakingNews(limit: Int = 6): [Article!]!
      latestByCategory(categorySlug: String!, limit: Int = 6): [Article!]!
      trending(limit: Int = 10): [Article!]!
      relatedArticles(slug: String!, limit: Int = 6): [Article!]!
      enhancedRelatedArticles(input: RelatedArticlesInput!): RelatedArticlesResult!
      topicBySlug(categorySlug: String!, topicSlug: String!): Topic
      topicsByCategory(categorySlug: String!): [Topic!]!

      # Search queries
      searchArticles(input: SearchInput!): SearchResult!
      searchSuggestions(query: String!, limit: Int = 5): [String!]!

      # User management queries
      listUsers(input: ListUsersInput!): UserListResult!
      getUserById(id: ID!): User!
      getUserStats: UserStats!
      getBasicStats: BasicStats!
      getUserActivity(userId: ID, limit: Int = 50): [ActivityLog!]!

      # Workflow queries
      reviewQueue(filters: ReviewQueueFilters): ReviewQueue!
      workflowStats(timeframe: String = "week"): WorkflowStats!
      getPermissionSummary(role: UserRole!): PermissionSummary!
      getAvailableWorkflowActions(articleId: ID!): [WorkflowAction!]!

      # Notification queries
      myNotifications(
        limit: Int = 20
        offset: Int = 0
        unreadOnly: Boolean = false
      ): NotificationConnection!
      unreadNotificationCount: Int!

      # Revision workflow queries
      revisionRequests(articleId: ID!, status: RevisionRequestStatus): [ArticleRevisionRequest!]!
      articleRevisionHistory(articleId: ID!, limit: Int = 20, skip: Int = 0): [ArticleRevision!]!
      latestRevisionRequest(articleId: ID!): ArticleRevisionRequest

      # Breaking news workflow queries
      breakingNewsRequests(articleId: ID, status: BreakingNewsRequestStatus): [BreakingNewsRequest!]!
      pendingBreakingNewsRequests: [BreakingNewsRequest!]!

      # Settings queries
      settings(type: SettingType): [Setting!]!
      setting(key: String!): Setting
      publicSettings: [Setting!]!

      # Audit log queries
      auditLogs(filters: AuditLogFilters): AuditLogConnection!
      auditStats(timeframe: AuditTimeframe = week): AuditStats!
      userAuditHistory(userId: ID!, limit: Int = 50): [AuditLog!]!
    }

    type Mutation {
        submitAccountRequest(input: AccountRequestInput!): AccountRequestResult!
        approveAccountRequest(id: ID!, customMessage: String): AccountRequestResult!
        rejectAccountRequest(id: ID!, customMessage: String): AccountRequestResult!
        verifyAccountRequest(id: ID!, code: String!): AccountRequestResult!
      # Authentication mutations
      register(input: RegisterInput!): AuthResponse!
      login(input: LoginInput!): AuthResponse!

      # Article mutations
      upsertArticle(id: ID, input: UpsertArticleInput!): Article!
      setArticleStatus(id: ID!, status: ArticleStatus!): Article!
      incrementArticleView(slug: String!): Boolean!
      deleteArticle(id: ID!): Boolean!
      upsertTopic(id: ID, input: UpsertTopicInput!): Topic!
      deleteTopic(id: ID!): Boolean!

      # Category mutations
      createCategory(input: CreateCategoryInput!): Category!
      updateCategory(id: ID!, input: UpdateCategoryInput!): Category!
      deleteCategory(id: ID!): Boolean!

      # User management mutations
      createUser(input: CreateUserInput!): UserManagementResult!
      updateUserProfile(input: UpdateUserProfileInput!): UserManagementResult!
      updateUserRole(input: UpdateUserRoleInput!): UserManagementResult!
      updateUserStatus(input: UpdateUserStatusInput!): UserManagementResult!
      deleteUser(id: ID!): UserManagementResult!
      changePassword(input: ChangePasswordInput!): PasswordResetResult!
      requestPasswordReset(input: RequestPasswordResetInput!): PasswordResetResult!
      resetPassword(input: ResetPasswordInput!): PasswordResetResult!
      bulkUpdateUserRoles(userIds: [ID!]!, role: UserRole!): UserManagementResult!
      bulkUpdateUserStatus(userIds: [ID!]!, isActive: Boolean!): UserManagementResult!

      # Workflow mutations
      performWorkflowAction(input: WorkflowActionInput!): WorkflowActionResult!
      performBulkWorkflowAction(input: BulkWorkflowActionInput!): BulkWorkflowActionResult!

      # Notification mutations
      markNotificationRead(id: ID!): Notification!
      markAllNotificationsRead: Int!

      # Revision workflow mutations
      requestArticleRevision(input: RequestArticleRevisionInput!): ArticleRevisionRequest!
      approveArticleRevision(requestId: ID!, reviewComment: String): Article!
      rejectArticleRevision(requestId: ID!, reviewComment: String): ArticleRevisionRequest!
      consumeArticleRevision(requestId: ID!): ArticleRevisionRequest!

      # Breaking news workflow mutations
      requestBreakingNews(articleId: ID!, reason: String): BreakingNewsRequest!
      approveBreakingNews(requestId: ID!, reviewComment: String): BreakingNewsRequest!
      rejectBreakingNews(requestId: ID!, reviewComment: String): BreakingNewsRequest!

      # Settings mutations
      updateSetting(input: UpdateSettingInput!): Setting!
      updateSettings(input: [UpdateSettingInput!]!): [Setting!]!
      resetSetting(key: String!): Setting!
    }

    type Topic {
      id: ID!
      slug: String!
      title: String!
      description: String
      coverImageUrl: String
      coverVideoUrl: String
      createdAt: String!
      updatedAt: String!
      category: Category!
    }

    input UpsertTopicInput {
      categorySlug: String!
      slug: String!
      title: String!
      description: String
      coverImageUrl: String
      coverVideoUrl: String
    }

    input CreateCategoryInput {
      name: String!
      slug: String!
    }

    input UpdateCategoryInput {
      name: String
      slug: String
    }

    input SearchInput {
      query: String!
      categorySlug: String
      tags: [String!]
      authorName: String
      status: ArticleStatus
      dateFrom: String
      dateTo: String
      sortBy: SearchSortBy = relevance
      sortOrder: SortOrder = desc
      take: Int = 20
      skip: Int = 0
    }

    enum SearchSortBy {
      relevance
      date
      views
      title
    }

    enum SortOrder {
      asc
      desc
    }

    type SearchResult {
      articles: [Article!]!
      totalCount: Int!
      hasMore: Boolean!
      searchMeta: SearchMeta!
    }

    type SearchMeta {
      query: String!
      totalResults: Int!
      searchTime: Int!
      filters: SearchFilters!
    }

    type SearchFilters {
      category: String
      tags: [String!]
      author: String
      status: String
      dateRange: DateRange
    }

    type DateRange {
      from: String
      to: String
    }

    input RelatedArticlesInput {
      slug: String!
      limit: Int = 6
      algorithm: RelatedArticlesAlgorithm = hybrid
      includeBreaking: Boolean = false
      excludeIds: [String!]
    }

    enum RelatedArticlesAlgorithm {
      hybrid
      tags
      category
      content
      popularity
    }

    type RelatedArticlesResult {
      articles: [Article!]!
      algorithm: String!
      totalFound: Int!
      cacheHit: Boolean!
      processingTime: Int!
      scores: JSON
    }

    # ============================================================================
    # USER MANAGEMENT TYPES
    # ============================================================================

    enum UserStatus {
      ACTIVE
      INACTIVE
    }

    enum UserSortBy {
      name
      email
      role
      createdAt
      updatedAt
    }

    type UserListResult {
      users: [User!]!
      totalCount: Int!
      hasMore: Boolean!
      filters: UserListFilters!
    }

    type UserListFilters {
      search: String
      role: UserRole
      status: UserStatus
    }

    type UserManagementResult {
      success: Boolean!
      message: String!
      user: User
    }

    type PasswordResetResult {
      success: Boolean!
      message: String!
    }

    type UserStats {
      totalUsers: Int!
      activeUsers: Int!
      inactiveUsers: Int!
      usersByRole: UserRoleStats!
      recentRegistrations: Int!
    }

    type UserRoleStats {
      admin: Int!
      editor: Int!
      author: Int!
    }

    type BasicStats {
      totalUsers: Int!
      totalArticles: Int!
    }

    type ActivityLog {
      id: ID!
      userId: String!
      activityType: String!
      details: JSON
      performedBy: String!
      timestamp: String!
      user: User
    }

    input CreateUserInput {
      name: String!
      email: String!
      password: String!
      role: UserRole = AUTHOR
      isActive: Boolean = true
      sendWelcomeEmail: Boolean = true
    }

    input ListUsersInput {
      take: Int = 20
      skip: Int = 0
      search: String
      role: UserRole
      status: UserStatus
      sortBy: UserSortBy = createdAt
      sortOrder: SortOrder = desc
    }

    input UpdateUserProfileInput {
      userId: ID!
      name: String!
      email: String!
    }

    input UpdateUserRoleInput {
      userId: ID!
      role: UserRole!
    }

    input UpdateUserStatusInput {
      userId: ID!
      isActive: Boolean!
      reason: String
    }

    input RequestPasswordResetInput {
      email: String!
    }

    input ResetPasswordInput {
      token: String!
      newPassword: String!
    }

    input ChangePasswordInput {
      userId: ID!
      currentPassword: String!
      newPassword: String!
    }

    input ArticleRevisionChangesInput {
      title: String
      excerpt: String
      topic: String
      contentJson: JSON
      coverImageUrl: String
      seoTitle: String
      seoDescription: String
      ogImageUrl: String
      categorySlug: String
      tagSlugs: [String!]
      isFeatured: Boolean
      isEditorsPick: Boolean
      isBreaking: Boolean
      pinnedAt: String
    }

    input RequestArticleRevisionInput {
      articleId: ID!
      note: String
      changes: ArticleRevisionChangesInput!
    }

    input UpdateSettingInput {
      key: String!
      value: JSON!
    }

  ` + registrationRequestTypeDefs,

  resolvers: {
        AccountRequest: {
          createdAt: (p: any) => toIso(p.createdAt),
          updatedAt: (p: any) => toIso(p.updatedAt),
        },
    JSON: GraphQLJSONObject,

    Category: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
    },

    Tag: {
      createdAt: (p: any) => toIso(p.createdAt),
    },

    User: {
      createdAt: (p: any) => toIso(p.createdAt),
    },

    Setting: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
    },

    Notification: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
      readAt: (p: any) => toIso(p.readAt),
      fromUser: async (p: any) => {
        if (!p.fromUserId) return null;
        return db.user.findUnique({
          where: { id: p.fromUserId },
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        });
      },
    },

    AuditLog: {
      createdAt: (p: any) => toIso(p.timestamp || p.createdAt),

      userEmail: async (p: any) => {
        if (!p.userId) return null;
        const user = await db.user.findUnique({
          where: { id: p.userId },
          select: { email: true },
        });
        return user?.email || null;
      },

      targetUserEmail: async (p: any) => {
        if (!p.targetUserId) return null;
        const user = await db.user.findUnique({
          where: { id: p.targetUserId },
          select: { email: true },
        });
        return user?.email || null;
      },

      resourceName: async (p: any) => {
        if (!p.resourceId) return null;

        // Get resource name based on resource type
        try {
          if (p.resourceType === 'Article') {
            const article = await db.article.findUnique({
              where: { id: p.resourceId },
              select: { title: true },
            });
            return article?.title || null;
          } else if (p.resourceType === 'Category') {
            const category = await db.category.findUnique({
              where: { id: p.resourceId },
              select: { name: true },
            });
            return category?.name || null;
          } else if (p.resourceType === 'User') {
            const user = await db.user.findUnique({
              where: { id: p.resourceId },
              select: { name: true },
            });
            return user?.name || null;
          } else if (p.resourceType === 'Setting') {
            // For settings, the resourceId is the setting key
            return p.resourceId;
          }
        } catch {
          // Resource might have been deleted
          return null;
        }

        return null;
      },

      action: (p: any) => {
        // Format event type as readable action
        const eventType = p.eventType as string;
        return eventType
          .split('_')
          .map((word: string) => word.charAt(0) + word.slice(1).toLowerCase())
          .join(' ');
      },

      description: (p: any) => {
        const eventType = p.eventType as string;
        const success = p.success ? 'succeeded' : 'failed';
        const resource = p.resourceType ? ` on ${p.resourceType}` : '';

        // Create human-readable description
        const descriptions: Record<string, string> = {
          USER_LOGIN: `User login ${success}`,
          USER_LOGOUT: `User logout ${success}`,
          USER_REGISTRATION: `New user registration ${success}`,
          USER_CREATED: `User account created ${success}`,
          USER_UPDATED: `User profile updated ${success}`,
          USER_DELETED: `User account deleted ${success}`,
          USER_ROLE_CHANGED: `User role changed ${success}`,
          USER_STATUS_CHANGED: `User status changed ${success}`,
          ARTICLE_CREATED: `Article created ${success}`,
          ARTICLE_UPDATED: `Article updated ${success}`,
          ARTICLE_DELETED: `Article deleted ${success}`,
          ARTICLE_STATUS_CHANGED: `Article status changed ${success}`,
          ARTICLE_PUBLISHED: `Article published ${success}`,
          ARTICLE_UNPUBLISHED: `Article unpublished ${success}`,
          ARTICLE_FEATURED: `Article marked as featured ${success}`,
          ARTICLE_UNFEATURED: `Article removed from featured ${success}`,
          ARTICLE_BREAKING_SET: `Breaking news flag set ${success}`,
          ARTICLE_BREAKING_UNSET: `Breaking news flag removed ${success}`,
          PERMISSION_DENIED: `Access denied to ${resource}`,
        };

        return descriptions[eventType] || eventType.replace(/_/g, ' ').toLowerCase();
      },
    },

    Article: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
      publishedAt: (p: any) => toIso(p.publishedAt),
      pinnedAt: (p: any) => toIso(p.pinnedAt),
      revisionRequestedAt: (p: any) => toIso(p.revisionRequestedAt),
      breakingNewsRequestedAt: (p: any) => toIso(p.breakingNewsRequestedAt),
      isBreaking: (p: any) => p.isBreaking ?? false,

      category: async (parent: any) => {
        if (!parent.categoryId) return null;
        return db.category.findUnique({ where: { id: parent.categoryId } });
      },

      breakingNewsRequestedBy: async (parent: any) => {
        if (!parent.breakingNewsRequestedById) return null;
        return db.user.findUnique({ where: { id: parent.breakingNewsRequestedById } });
      },

      tags: async (parent: any) => {
        // Article -> ArticleTag[] (tags)
        // Tag -> ArticleTag[] (articles)
        return db.tag.findMany({
          where: { articles: { some: { articleId: parent.id } } },
          orderBy: { name: 'asc' },
        });
      },
    },

    Topic: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),

      category: async (parent: any) => {
        return db.category.findUnique({
          where: { id: parent.categoryId },
        });
      },
    },

    ArticleRevisionRequest: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
      reviewedAt: (p: any) => toIso(p.reviewedAt),
      consumedAt: (p: any) => toIso(p.consumedAt),
      article: async (p: any) =>
        p.article ||
        (await db.article.findUnique({
          where: { id: p.articleId },
        })),
      requester: async (p: any) =>
        p.requester ||
        (await db.user.findUnique({
          where: { id: p.requesterId },
        })),
      reviewedBy: async (p: any) => {
        if (p.reviewedBy) return p.reviewedBy;
        if (!p.reviewedById) return null;
        return db.user.findUnique({
          where: { id: p.reviewedById },
        });
      },
      consumedBy: async (p: any) => {
        if (p.consumedBy) return p.consumedBy;
        if (!p.consumedById) return null;
        return db.user.findUnique({
          where: { id: p.consumedById },
        });
      },
    },

    ArticleRevision: {
      appliedAt: (p: any) => toIso(p.appliedAt),
      article: async (p: any) =>
        p.article ||
        (await db.article.findUnique({
          where: { id: p.articleId },
        })),
      revisionRequest: async (p: any) => {
        if (p.revisionRequest) return p.revisionRequest;
        if (!p.revisionRequestId) return null;
        return db.articleRevisionRequest.findUnique({
          where: { id: p.revisionRequestId },
        });
      },
      appliedBy: async (p: any) =>
        p.appliedBy ||
        (await db.user.findUnique({
          where: { id: p.appliedById },
        })),
    },

    BreakingNewsRequest: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
      reviewedAt: (p: any) => toIso(p.reviewedAt),
      article: async (p: any) =>
        p.article ||
        (await db.article.findUnique({
          where: { id: p.articleId },
        })),
      requester: async (p: any) =>
        p.requester ||
        (await db.user.findUnique({
          where: { id: p.requesterId },
        })),
      reviewedBy: async (p: any) => {
        if (p.reviewedBy) return p.reviewedBy;
        if (!p.reviewedById) return null;
        return db.user.findUnique({
          where: { id: p.reviewedById },
        });
      },
    },

    Query: {
            accountRequests: async (_: unknown, { status }: { status?: string }, context: GraphQLContext) => {
              // Check authentication gracefully
              if (!context.user) {
                throw new AuthenticationError('Authentication required');
              }
              
              // Check admin role
              if (context.user.role !== 'ADMIN') {
                throw new AuthorizationError('Admin access required');
              }
              
              return db.accountRequest.findMany({
                where: status ? { status } : {},
                orderBy: { createdAt: 'desc' },
              });
            },
      me: async (_: unknown, __: unknown, context: GraphQLContext) => {
        if (!context.user) {
          return {
            success: false,
            message: 'Authentication required',
          };
        }

        return getCurrentUser(context.user.id);
      },

      debugAuth: async (_: unknown, __: unknown, context: GraphQLContext) => {
        try {
          // Import permission services
          const { PermissionService, Permission } = await import('../services/permissionService');

          if (!context.user) {
            return {
              success: false,
              message: 'No user in context',
              debug: {
                hasContext: !!context,
                hasUser: false,
                timestamp: new Date().toISOString(),
              },
            };
          }

          const userRole = context.user.role;
          const hasCreateArticle = PermissionService.hasPermission(
            userRole,
            Permission.CREATE_ARTICLE
          );
          const hasUpdateAny = PermissionService.hasPermission(
            userRole,
            Permission.UPDATE_ANY_ARTICLE
          );
          const hasReviewArticles = PermissionService.hasPermission(
            userRole,
            Permission.REVIEW_ARTICLES
          );

          return {
            success: true,
            message: 'Authentication debug info',
            debug: {
              user: {
                id: context.user.id,
                email: context.user.email,
                name: context.user.name,
                role: context.user.role,
                isActive: context.user.isActive,
              },
              permissions: {
                CREATE_ARTICLE: hasCreateArticle,
                UPDATE_ANY_ARTICLE: hasUpdateAny,
                REVIEW_ARTICLES: hasReviewArticles,
              },
              rolePermissions: PermissionService.getRolePermissions(userRole),
              timestamp: new Date().toISOString(),
            },
          };
        } catch (error) {
          return {
            success: false,
            message: 'Debug auth failed',
            debug: {
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            },
          };
        }
      },

      debugArticles,

      categories: async () => db.category.findMany({ orderBy: { name: 'asc' } }),
      topics: async () => db.topic.findMany({ include: { category: true }, orderBy: { title: 'asc' } }),

      articles: async (_: unknown, args: any, context: GraphQLContext) => {
        // Require authentication for articles management
        requireAuth(context);

        // Import permission services with static import for better reliability
        const { PermissionService, Permission } = await import('../services/permissionService');

        const userRole = context.user!.role;
        const userId = context.user!.id;

        // Build where clause for filtering
        const where: any = {};

        if (args.status) {
          where.status = args.status;
        }

        if (args.topic) {
          where.topic = args.topic;
        }

        if (args.categorySlug) {
          where.category = { is: { slug: args.categorySlug } };
        }

        // Handle explicit authorId parameter (for "My Articles" page)
        if (args.authorId) {
          where.authorId = args.authorId;
        } else {
          // Apply role-based filtering for general articles access

          // Check if user has permission to see all articles
          const hasUpdateAnyPermission = PermissionService.hasPermission(
            userRole,
            Permission.UPDATE_ANY_ARTICLE
          );

          if (!hasUpdateAnyPermission) {
            // Authors can only see their own articles
            where.authorId = userId;
          }
        }

        const select = await getArticleSelect();

        const articles = await db.article.findMany({
          where,
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          take: args.take ?? 20,
          skip: args.skip ?? 0,
          select,
        });

        return articles;
      },

      articleBySlug: async (_: unknown, { slug }: { slug: string }) => {
        const select = await getArticleSelect();

        return db.article.findFirst({
          where: {
            slug,
            status: 'PUBLISHED', // Only show published articles
          },
          select,
        });
      },

      articleById: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        // Require preview permission for all authenticated users (admin, editor, author)
        requirePreview(context);

        const select = await getArticleSelect();

        return db.article.findUnique({
          where: { id },
          select,
        });
      },

      articlesByTopic: async (_: unknown, { categorySlug, topicSlug }: { categorySlug: string; topicSlug: string }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: {
            status: 'PUBLISHED', // Only show published articles
            category: { is: { slug: categorySlug } },
            topic: { equals: topicSlug, mode: "insensitive" },
          },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          select,
        });
      },

      topStories: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isFeatured: true, status: 'PUBLISHED' },
          orderBy: [
            // null-safe ordering
            { pinnedAt: { sort: 'desc', nulls: 'last' } },
            { publishedAt: 'desc' },
          ],
          take: limit ?? 6,
          select,
        });
      },

      editorsPicks: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isEditorsPick: true, status: 'PUBLISHED' },
          orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
          take: limit ?? 6,
          select,
        });
      },

      breakingNews: async (_: unknown, { limit }: { limit?: number }) => {
        const includeBreaking = await hasBreakingColumn();
        if (!includeBreaking) return [];

        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isBreaking: true, status: 'PUBLISHED' },
          orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { publishedAt: 'desc' }],
          take: limit ?? 6,
          select,
        });
      },

      latestByCategory: async (
        _: unknown,
        { categorySlug, limit }: { categorySlug: string; limit?: number }
      ) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: {
            status: 'PUBLISHED',
            category: { is: { slug: categorySlug } },
          },
          orderBy: { publishedAt: 'desc' },
          take: limit ?? 6,
          select,
        });
      },

      trending: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { status: 'PUBLISHED' },
          orderBy: { viewCount: 'desc' },
          take: limit ?? 10,
          select,
        });
      },

      relatedArticles: async (_: unknown, { slug, limit }: { slug: string; limit?: number }) => {
        // Keep the original simple implementation for backward compatibility
        const select = await getArticleSelect();
        const article = await db.article.findFirst({
          where: { slug },
          select: { ...select, tags: true }, // ArticleTag[]
        });

        if (!article) return [];

        const tagIds = (article.tags ?? []).map((t: any) => t.tagId).filter(Boolean);
        if (!tagIds.length) return [];

        return db.article.findMany({
          where: {
            status: 'PUBLISHED',
            id: { not: article.id },
            tags: { some: { tagId: { in: tagIds } } },
          },
          orderBy: { publishedAt: 'desc' },
          take: limit ?? 6,
          select,
        });
      },

      enhancedRelatedArticles: async (_: unknown, { input }: { input: any }) => {
        try {
          const result = await getRelatedArticles(input);
          return result;
        } catch (error) {
          console.error('Enhanced related articles error:', error);
          throw new Error('Failed to get related articles. Please try again.');
        }
      },

      topicBySlug: async (
        _: unknown,
        { categorySlug, topicSlug }: { categorySlug: string; topicSlug: string }
      ) => {
        const category = await db.category.findUnique({
          where: { slug: categorySlug },
          select: { id: true },
        });

        if (!category) return null;

        return db.topic.findFirst({
          where: {
            categoryId: category.id,
            slug: topicSlug,
          },
        });
      },

      topicsByCategory: async (_: unknown, { categorySlug }: { categorySlug: string }) => {
        const category = await db.category.findUnique({
          where: { slug: categorySlug },
          select: { id: true },
        });

        if (!category) return [];

        return db.topic.findMany({
          where: { categoryId: category.id },
          orderBy: { title: 'asc' },
        });
      },

      // Search resolvers
      searchArticles: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        try {
          const result = await searchArticles(input, context.user?.id);
          return result;
        } catch (error) {
          console.error('Search articles error:', error);
          throw new Error('Search failed. Please try again.');
        }
      },

      searchSuggestions: async (
        _: unknown,
        { query, limit }: { query: string; limit?: number }
      ) => {
        try {
          return await getSearchSuggestions(query, limit);
        } catch (error) {
          console.error('Search suggestions error:', error);
          return [];
        }
      },

      // ============================================================================
      // USER MANAGEMENT QUERIES
      // ============================================================================

      listUsers: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { listUsers } = await import('../services/userManagementService.js');

        return listUsers(input, context.user!.id);
      },

      getUserById: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireAuth(context);
        const { getUserById } = await import('../services/userManagementService.js');

        return getUserById(id, context.user!.id, context.user!.role === 'ADMIN');
      },

      getUserStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { getUserStats } = await import('../services/userManagementService.js');

        return getUserStats();
      },

      getBasicStats: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireAuth(context);
        // Note: Only requires authentication, not admin role

        try {
          // Get basic counts that are safe for all authenticated users
          const totalUsers = await prisma.user.count({
            where: { isActive: true },
          });

          const totalArticles = await prisma.article.count();

          return {
            totalUsers,
            totalArticles,
          };
        } catch (error) {
          console.error('🔍 Backend Debug - Error in getBasicStats:', error);
          // Return zeros if query fails
          return {
            totalUsers: 0,
            totalArticles: 0,
          };
        }
      },

      getUserActivity: async (
        _: unknown,
        { userId, limit }: { userId?: string; limit?: number },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { getUserActivity } = await import('../services/userManagementService.js');

        return getUserActivity(userId, limit);
      },

      // Settings queries
      settings: async (_: unknown, { type }: { type?: string }, context: GraphQLContext) => {
        // Public settings can be accessed by anyone, private settings require admin
        const isAdmin = context.user?.role === 'ADMIN';

        const where: any = {};
        if (type) where.type = type;

        const settings = await db.setting.findMany({
          where,
          orderBy: { key: 'asc' },
        });

        // Filter out private settings for non-admin users and handle corrupted JSON values
        const validSettings = settings
          .filter((setting: { isPublic: any }) => setting.isPublic || isAdmin)
          .filter((setting: { value: null | undefined; key: any }) => {
            // Check if the value is valid JSON
            try {
              if (setting.value === null || setting.value === undefined) {
                console.warn(`⚠️  Setting ${setting.key} has null/undefined value, skipping`);
                return false;
              }

              // Check for asterisk corruption
              const valueStr = String(setting.value);
              if (valueStr.includes('*') && valueStr.trim() === '*') {
                console.warn(
                  `⚠️  Setting ${setting.key} has corrupted value: ${valueStr}, skipping`
                );
                return false;
              }

              // Try to parse as JSON to validate
              JSON.parse(JSON.stringify(setting.value));
              return true;
            } catch {
              return false;
            }
          });

        return validSettings;
      },

      setting: async (_: unknown, { key }: { key: string }, context: GraphQLContext) => {
        const setting = await db.setting.findUnique({
          where: { key },
        });

        if (!setting) return null;

        // Check if user can access this setting
        const isAdmin = context.user?.role === 'ADMIN';
        if (!setting.isPublic && !isAdmin) {
          throw new Error('Access denied: This setting is private');
        }

        // Validate JSON value before returning
        try {
          if (setting.value === null || setting.value === undefined) {
            return null;
          }

          // Check for asterisk corruption
          const valueStr = String(setting.value);
          if (valueStr.includes('*') && valueStr.trim() === '*') {
            return null;
          }

          // Try to parse as JSON to validate
          JSON.parse(JSON.stringify(setting.value));
          return setting;
        } catch {
          return null;
        }
      },

      publicSettings: async () => {
        const settings = await db.setting.findMany({
          where: { isPublic: true },
          orderBy: { key: 'asc' },
        });

        // Filter out corrupted JSON values
        const validSettings = settings.filter((setting: { value: null | undefined }) => {
          try {
            if (setting.value === null || setting.value === undefined) {
              return false;
            }

            // Check for asterisk corruption
            const valueStr = String(setting.value);
            if (valueStr.includes('*') && valueStr.trim() === '*') {
              return false;
            }

            // Try to parse as JSON to validate
            JSON.parse(JSON.stringify(setting.value));
            return true;
          } catch {
            return false;
          }
        });

        return validSettings;
      },

      // ============================================================================
      // AUDIT LOG QUERIES
      // ============================================================================

      auditLogs: async (_: unknown, { filters }: { filters?: any }, context: GraphQLContext) => {
        requireAdmin(context);
        const { AuditService } = await import('../services/auditService');

        const logs = await AuditService.getAuditLogs({
          userId: filters?.userId,
          eventType: filters?.eventType,
          resourceId: filters?.resourceId,
          resourceType: filters?.resourceType,
          startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
          endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
          limit: filters?.limit || 100,
          offset: filters?.offset || 0,
        });

        const totalCount = logs.length; // You may want to add a separate count query

        return {
          logs,
          totalCount,
          hasMore: logs.length === (filters?.limit || 100),
        };
      },

      auditStats: async (
        _: unknown,
        { timeframe }: { timeframe?: 'day' | 'week' | 'month' },
        context: GraphQLContext
      ) => {
        requireAdmin(context);
        const { AuditService } = await import('../services/auditService');

        return await AuditService.getAuditStats(timeframe || 'week');
      },

      userAuditHistory: async (
        _: unknown,
        { userId, limit }: { userId: string; limit?: number },
        context: GraphQLContext
      ) => {
        // Users can view their own history, or admins can view any history
        if (context.user?.id !== userId && context.user?.role !== 'ADMIN') {
          throw new Error('Unauthorized to view this audit history');
        }

        const { AuditService } = await import('../services/auditService');

        return await AuditService.getAuditLogs({
          userId,
          limit: limit || 50,
        });
      },

      // ============================================================================
      // WORKFLOW QUERIES
      // ============================================================================

      reviewQueue: async (_: unknown, { filters }: { filters?: any }, context: GraphQLContext) => {
        const { ArticleWorkflowService } = await import('../services/articleWorkflowService');
        return await ArticleWorkflowService.getReviewQueue(context, filters || {});
      },

      workflowStats: async (
        _: unknown,
        { timeframe }: { timeframe?: string },
        context: GraphQLContext
      ) => {
        const { ArticleWorkflowService } = await import('../services/articleWorkflowService');
        return await ArticleWorkflowService.getWorkflowStats(context, timeframe as any);
      },

      getPermissionSummary: async (
        _: unknown,
        { role }: { role: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService } = await import('../services/permissionService');
        return PermissionService.getPermissionSummary(role as any);
      },

      getAvailableWorkflowActions: async (
        _: unknown,
        { articleId }: { articleId: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);

        const article = await db.article.findUnique({
          where: { id: articleId },
          select: { status: true, authorId: true },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        const { PermissionService } = await import('../services/permissionService');
        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        return PermissionService.getAvailableWorkflowActions(userRole, article.status, isOwner);
      },

      myNotifications: async (
        _: unknown,
        {
          limit,
          offset,
          unreadOnly,
        }: { limit?: number; offset?: number; unreadOnly?: boolean },
        context: GraphQLContext
      ) => {
        requireAuth(context);

        const where: any = {
          toUserId: context.user!.id,
        };

        if (unreadOnly) {
          where.isRead = false;
        }

        const [notifications, totalCount] = await Promise.all([
          db.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit ?? 20,
            skip: offset ?? 0,
          }),
          db.notification.count({ where }),
        ]);

        return {
          notifications,
          totalCount,
          hasMore: (offset ?? 0) + notifications.length < totalCount,
        };
      },

      unreadNotificationCount: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireAuth(context);

        return db.notification.count({
          where: {
            toUserId: context.user!.id,
            isRead: false,
          },
        });
      },

      revisionRequests: async (
        _: unknown,
        { articleId, status }: { articleId: string; status?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const article = await db.article.findUnique({
          where: { id: articleId },
          select: { authorId: true },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          throw new Error('Permission denied: You cannot view revision requests for this article');
        }

        return db.articleRevisionRequest.findMany({
          where: {
            articleId,
            ...(status ? { status } : {}),
          },
          orderBy: { createdAt: 'desc' },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
          },
        });
      },

      articleRevisionHistory: async (
        _: unknown,
        { articleId, limit, skip }: { articleId: string; limit?: number; skip?: number },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const article = await db.article.findUnique({
          where: { id: articleId },
          select: { authorId: true },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          throw new Error('Permission denied: You cannot view revision history for this article');
        }

        return db.articleRevision.findMany({
          where: { articleId },
          orderBy: { appliedAt: 'desc' },
          take: limit ?? 20,
          skip: skip ?? 0,
          include: {
            article: true,
            revisionRequest: true,
            appliedBy: true,
          },
        });
      },

      latestRevisionRequest: async (
        _: unknown,
        { articleId }: { articleId: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const article = await db.article.findUnique({
          where: { id: articleId },
          select: { authorId: true },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          throw new Error('Permission denied: You cannot view revision requests for this article');
        }

        return db.articleRevisionRequest.findFirst({
          where: { articleId },
          orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
            consumedBy: true,
          },
        });
      },

      breakingNewsRequests: async (
        _: unknown,
        { articleId, status }: { articleId?: string; status?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const userRole = context.user!.role as any;
        const hasReviewPermission = PermissionService.hasPermission(
          userRole,
          Permission.REVIEW_ARTICLES
        );

        const where: any = {};

        if (articleId) {
          const article = await db.article.findUnique({
            where: { id: articleId },
            select: { authorId: true },
          });

          if (!article) {
            throw new Error('Article not found');
          }

          const isOwner = article.authorId === context.user!.id;

          if (!isOwner && !hasReviewPermission) {
            throw new Error(
              'Permission denied: You cannot view breaking news requests for this article'
            );
          }

          where.articleId = articleId;
        } else if (!hasReviewPermission) {
          where.article = { authorId: context.user!.id };
        }

        if (status) {
          where.status = status;
        }

        return db.breakingNewsRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
          },
        });
      },

      pendingBreakingNewsRequests: async (
        _: unknown,
        __: unknown,
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const userRole = context.user!.role as any;
        const hasReviewPermission = PermissionService.hasPermission(
          userRole,
          Permission.REVIEW_ARTICLES
        );

        const where: any = { status: 'PENDING' };

        if (!hasReviewPermission) {
          where.article = { authorId: context.user!.id };
        }

        return db.breakingNewsRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
          },
        });
      },

      // Registration Request Queries
      ...registrationRequestResolvers.Query,
    },

    Mutation: {
            submitAccountRequest: async (_: unknown, { input }: any) => {
              const { AccountRequestInput } = await import('../services/userManagementService');
              const parsed = AccountRequestInput.parse(input);
              const existing = await db.accountRequest.findFirst({ where: { email: parsed.email, status: { in: ['pending', 'awaiting_verification'] } } });
              if (existing) {
                return { success: false, message: 'Request already exists or pending', request: existing };
              }
              const request = await db.accountRequest.create({
                data: { ...parsed, status: 'pending' },
              });
              // Send notification to admins
              const admins = await db.user.findMany({ where: { role: 'ADMIN', isActive: true } });
              const { NotificationService } = await import('../services/notificationService');
              await NotificationService.createAndDispatch(admins.map((admin: any) => ({
                type: 'ACCOUNT_REQUEST',
                title: 'New Account Request',
                message: `${parsed.requesterName} requested ${parsed.requestedRole} role.`,
                fromUserId: '',
                toUserId: admin.id
              })));
              return { success: true, message: 'Account request submitted', request };
            },

            approveAccountRequest: async (_: unknown, { id, customMessage }: any, context: GraphQLContext) => {
              requireAuth(context);
              requireAdmin(context);
              // Generate verification code for user verification
              const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              const request = await db.accountRequest.update({
                where: { id },
                data: { status: 'awaiting_verification', customMessage, verificationCode },
              });
              

              try {
              // In-app notification
              const { NotificationService } = await import('../services/notificationService');
              await NotificationService.createAndDispatch([{
                type: 'APPROVAL',
                title: 'Account Request Approved',
                message: customMessage || 'Your account request has been approved! Please check your email for verification instructions.',
                fromUserId: context.user.id,
                toUserId: request.userId ? request.userId : ''
              }]);
              } catch (error) {
                console.error('❌ Failed to send in-app notification:', error);
              }
              return { success: true, message: 'Account request approved. User will receive verification instructions.', request };
            },

            rejectAccountRequest: async (_: unknown, { id, customMessage }: any, context: GraphQLContext) => {
              requireAuth(context);
              requireAdmin(context);
              const request = await db.accountRequest.update({
                where: { id },
                data: { status: 'rejected', customMessage },
              });
              
              try {
                // Send rejection email using proper template
                const { EmailService } = await import('../services/emailService');
                const supportEmail = await EmailService.getSupportEmail();
                
                await EmailService.sendRegistrationRejected(request.email, {
                  name: request.requesterName,
                  reason: customMessage,
                  supportEmail: supportEmail,
                });
                
                console.log(`✅ Rejection email sent to ${request.email}`);
              } catch (error) {
                console.error('❌ Failed to send rejection email:', error);
                // Don't fail the rejection if email fails
              }

              try {
              const { NotificationService } = await import('../services/notificationService');
              await NotificationService.createAndDispatch([{
                type: 'REJECTION',
                title: 'Account Request Rejected',
                message: customMessage || 'Your account request has been rejected.',
                fromUserId: context.user.id,
                toUserId: request.userId ? request.userId : ''
              }]);
              } catch (error) {
                console.error('❌ Failed to send in-app notification:', error);
              }
              return { success: true, message: 'Account request rejected and email sent', request };
            },

            verifyAccountRequest: async (_: unknown, { id, code }: any) => {
              // TODO: Securely verify code, activate user, send congratulations notification
              const request = await db.accountRequest.findUnique({ where: { id } });
              if (!request || request.status !== 'awaiting_verification') {
                return { success: false, message: 'Invalid or expired verification', request };
              }
              // Validate code
              if (request.verificationCode !== code) {
                return { success: false, message: 'Invalid verification code', request };
              }
              // Activate user account
              const user = await db.user.create({
                data: {
                  email: request.email,
                  name: request.requesterName,
                  role: request.requestedRole,
                  isActive: true,
                },
              });
              await db.accountRequest.update({
                where: { id },
                data: { status: 'active', userId: user.id },
              });
              // Send congratulations notification
              // Send account activation email
              try {
                const { EmailService } = await import('../services/emailService');
                const baseUrl = await EmailService.getBaseUrl();
                
                await EmailService.sendAccountActivation(request.email, {
                  name: request.requesterName,
                  email: request.email,
                  loginUrl: `${baseUrl}/login`,
                  role: request.requestedRole,
                });
                
                console.log(`✅ Account activation email sent to ${request.email}`);
              } catch (error) {
                console.error('❌ Failed to send activation email:', error);
                // Don't fail the verification if email fails
              }
              const { NotificationService } = await import('../services/notificationService');
              await NotificationService.createAndDispatch([{
                type: 'APPROVAL',
                title: 'Account Activated',
                message: 'Congratulations! Your account is now active.',
                fromUserId: '',
                toUserId: user.id
              }]);
              return { success: true, message: 'Account verified and activated', request };
            },
      register: async (_: unknown, { input }: any, context: GraphQLContext) => {
        return registerUser(input, context.request);
      },

      login: async (_: unknown, { input }: any, context: GraphQLContext) => {
        return loginUser(input, context.request);
      },

      upsertArticle: async (_: unknown, { id, input }: any, context: GraphQLContext) => {
        // Require authentication for article creation/editing
        requireAuth(context);

        const data = ArticleInput.parse(input);

        // Import permission services
        const { PermissionService, Permission } = await import('../services/permissionService');
        const { AuditService, AuditEventType } = await import('../services/auditService');

        const userRole = context.user!.role as any;

        // Check if this is an update or create operation
        let existingArticle = null;
        if (id) {
          existingArticle = await db.article.findUnique({
            where: { id },
            select: {
              id: true,
              authorId: true,
              status: true,
              title: true,
              isFeatured: true,
              isEditorsPick: true,
              isBreaking: true,
              authorEditAllowance: true,
            },
          });

          if (!existingArticle) {
            throw new Error('Article not found');
          }
        }

        // Permission checks for article operations
        if (existingArticle) {
          // Updating existing article
          const isOwner = existingArticle.authorId === context.user!.id;

          if (
            !isOwner &&
            !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)
          ) {
            await AuditService.logPermissionDenied(
              context.user!.id,
              'UPDATE_ARTICLE',
              existingArticle.id,
              'Article',
              context.request
            );
            throw new Error('Permission denied: You can only edit your own articles');
          }

          // Check if user can modify article features (featured, breaking, editor's pick)
          // Only check if user is trying to ENABLE features, not just sending the fields
          const hasFeatureChanges =
            (data.isFeatured === true && !existingArticle.isFeatured) ||
            (data.isEditorsPick === true && !existingArticle.isEditorsPick) ||
            (data.isBreaking === true && !existingArticle.isBreaking);

          if (hasFeatureChanges && !PermissionService.canSetArticleFeatures(userRole)) {
            throw new Error(
              "Permission denied: You cannot set article features (featured, breaking news, editor's pick)"
            );
          }

          if (userRole === 'AUTHOR' && existingArticle.status === 'PUBLISHED') {
            if (!existingArticle.authorEditAllowance || existingArticle.authorEditAllowance < 1) {
              throw new Error(
                'Permission denied: Please request a revision to edit this article again'
              );
            }
          }

          // Check if user can change article status
          if (data.status && data.status !== existingArticle.status) {
            if (data.status === 'PUBLISHED') {
              throw new Error('Use performWorkflowAction with APPROVE to publish articles');
            }
            if (
              !PermissionService.canPerformWorkflowAction(
                userRole,
                existingArticle.status,
                data.status,
                isOwner
              )
            ) {
              throw new Error(
                `Permission denied: Cannot change article status from ${existingArticle.status} to ${data.status}`
              );
            }
          }
        } else {
          // Creating new article
          if (!PermissionService.hasPermission(userRole, Permission.CREATE_ARTICLE)) {
            await AuditService.logPermissionDenied(
              context.user!.id,
              'CREATE_ARTICLE',
              undefined,
              'Article',
              context.request
            );
            throw new Error('Permission denied: You cannot create articles');
          }

          // Check if user can set article features on creation
          const hasFeatureSettings = data.isFeatured || data.isEditorsPick || data.isBreaking;
          if (hasFeatureSettings && !PermissionService.canSetArticleFeatures(userRole)) {
            throw new Error(
              "Permission denied: You cannot set article features (featured, breaking news, editor's pick)"
            );
          }

          if (data.status === 'PUBLISHED') {
            throw new Error('Create drafts or review articles, then use APPROVE to publish');
          }

          // Authors can only create drafts or submit for review
          if (userRole === 'AUTHOR' && data.status && !['DRAFT', 'REVIEW'].includes(data.status)) {
            throw new Error(
              'Permission denied: Authors can only create drafts or submit articles for review'
            );
          }
        }
        const includeBreaking = await hasBreakingColumn();

        // Enhanced category assignment with validation and fallback
        let category = null;
        if (data.categorySlug) {
          // Try to find the requested category
          category = await db.category.findFirst({
            where: { slug: data.categorySlug },
            select: { id: true, slug: true, name: true },
          });

          if (!category) {
            // Category not found - return error with available categories
            const availableCategories = await db.category.findMany({
              select: { slug: true, name: true },
              orderBy: { slug: 'asc' },
            });

            const availableSlugs = availableCategories.map((c: { slug: any }) => c.slug).join(', ');
            throw new Error(
              `Invalid category "${data.categorySlug}". Available categories: ${availableSlugs}`
            );
          }
        }

        const status = data.status ?? 'DRAFT';

        const payload: any = {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt ?? null,
          status,
          topic: data.topic ?? null,
          contentJson: data.contentJson ?? {
            time: Date.now(),
            blocks: [],
            version: '2.x',
          },

          isFeatured: data.isFeatured ?? false,
          isEditorsPick: data.isEditorsPick ?? false,
          pinnedAt: data.pinnedAt ? new Date(data.pinnedAt) : null,

          authorName: data.authorName ?? context.user.name,
          coverImageUrl: data.coverImageUrl ?? null,

          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          ogImageUrl: data.ogImageUrl ?? null,

          categoryId: category?.id ?? null,
        };

        if (
          existingArticle &&
          userRole === 'AUTHOR' &&
          existingArticle.status === 'PUBLISHED' &&
          existingArticle.authorEditAllowance
        ) {
          payload.authorEditAllowance = Math.max(0, existingArticle.authorEditAllowance - 1);
        }

        if (includeBreaking) {
          payload.isBreaking = data.isBreaking ?? false;
        }

        const select = await getArticleSelect();
        let article;

        if (id) {
          // update by ID (edit page)
          article = await db.article.update({
            where: { id },
            data: payload,
            select,
          });

          if (userRole === 'AUTHOR') {
            const latestRequest = await db.articleRevisionRequest.findFirst({
              where: {
                articleId: article.id,
                consumedAt: null,
                status: { in: ['APPROVED', 'REJECTED'] },
              },
              orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
              select: { id: true },
            });

            if (latestRequest) {
              await db.articleRevisionRequest.update({
                where: { id: latestRequest.id },
                data: {
                  consumedAt: new Date(),
                  consumedById: context.user!.id,
                },
              });
            }
          }
        } else {
          // create OR update by slug (new page / retry-safe)
          const existing = await db.article.findUnique({
            where: { slug: data.slug },
            select: { id: true },
          });

          if (existing) {
            article = await db.article.update({
              where: { id: existing.id },
              data: payload,
              select,
            });

            if (userRole === 'AUTHOR') {
              const latestRequest = await db.articleRevisionRequest.findFirst({
                where: {
                  articleId: existing.id,
                  consumedAt: null,
                  status: { in: ['APPROVED', 'REJECTED'] },
                },
                orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
                select: { id: true },
              });

              if (latestRequest) {
                await db.articleRevisionRequest.update({
                  where: { id: latestRequest.id },
                  data: {
                    consumedAt: new Date(),
                    consumedById: context.user!.id,
                  },
                });
              }
            }
          } else {
            article = await db.article.create({
              data: {
                ...payload,
                authorId: context.user.id,
                publishedAt: status === 'PUBLISHED' ? new Date() : null,
              },
              select,
            });
          }
        }

        // tags
        if (data.tagSlugs) {
          await db.articleTag.deleteMany({
            where: { articleId: article.id },
          });

          const unique = Array.from(new Set(data.tagSlugs.map(normalizeTagSlug).filter(Boolean)));

          for (const slug of unique) {
            const tag = await db.tag.upsert({
              where: { slug },
              update: {},
              create: { slug, name: slug },
            });

            await db.articleTag.create({
              data: { articleId: article.id, tagId: tag.id },
            });
          }
        }

        // Log the article operation
        const eventType = existingArticle
          ? AuditEventType.ARTICLE_UPDATED
          : AuditEventType.ARTICLE_CREATED;
        await AuditService.logArticleEvent(
          eventType,
          context.user!.id,
          article.id,
          {
            title: article.title,
            status: article.status,
            isUpdate: !!existingArticle,
            changes: existingArticle
              ? {
                  statusChanged: data.status && data.status !== existingArticle.status,
                  featuresChanged:
                    data.isFeatured !== undefined ||
                    data.isEditorsPick !== undefined ||
                    data.isBreaking !== undefined,
                }
              : undefined,
          },
          context.request
        );

        return article;
      },

      setArticleStatus: async (_: unknown, { id, status }: any, context: GraphQLContext) => {
        // Require authentication
        requireAuth(context);

        // Require editor permissions for publishing articles
        if (status === 'PUBLISHED') {
          throw new Error('Use performWorkflowAction with APPROVE to publish articles');
        }

        return db.article.update({
          where: { id },
          data: {
            status,
            publishedAt: status === 'PUBLISHED' ? new Date() : null,
          },
          select: {
            id: true,
            status: true,
            publishedAt: true,
          },
        });
      },

      incrementArticleView: async (_: unknown, { slug }: any) => {
        await db.article.updateMany({
          where: { slug },
          data: { viewCount: { increment: 1 } },
        });
        return true;
      },

      deleteArticle: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireAuth(context);

        const article = await db.article.findUnique({
          where: { id },
          select: { id: true, authorId: true, title: true, status: true },
        });
        if (!article) return false;

        // Import permission services
        const { PermissionService, Permission } = await import('../services/permissionService');
        const { AuditService, AuditEventType } = await import('../services/auditService');

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        // Check permissions for article deletion
        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.DELETE_ANY_ARTICLE)) {
          await AuditService.logPermissionDenied(
            context.user!.id,
            'DELETE_ARTICLE',
            id,
            'Article',
            context.request
          );
          throw new Error('Permission denied: You can only delete your own articles');
        }

        // Authors cannot delete published articles
        if (isOwner && userRole === 'AUTHOR' && article.status === 'PUBLISHED') {
          throw new Error('Permission denied: You cannot delete published articles');
        }

        await db.articleTag.deleteMany({
          where: { articleId: id },
        });

        await db.article.delete({
          where: { id },
          select: { id: true },
        });

        // Log the article deletion
        await AuditService.logArticleEvent(
          AuditEventType.ARTICLE_DELETED,
          context.user!.id,
          id,
          {
            title: article.title,
            status: article.status,
            wasOwner: isOwner,
          },
          context.request
        );

        return true;
      },

      upsertTopic: async (_: unknown, { id, input }: any, context: GraphQLContext) => {
        const data = TopicInput.parse(input);
        requireAuth(context);
        requireAdmin(context);


        const category = await db.category.findUnique({
          where: { slug: data.categorySlug },
          select: { id: true },
        });

        if (!category) throw new Error('Category not found');

        const payload = {
          slug: data.slug,
          title: data.title,
          description: data.description ?? null,
          coverImageUrl: data.coverImageUrl ?? null,
          coverVideoUrl: data.coverVideoUrl ?? null,
          categoryId: category.id,
        };

        if (id) {
          return db.topic.update({
            where: { id },
            data: payload,
          });
        }

        return db.topic.upsert({
          where: {
            categoryId_slug: {
              categoryId: category.id,
              slug: data.slug,
            },
          },
          update: payload,
          create: payload,
        });
      },

      deleteTopic: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        const topic = await db.topic.findUnique({ where: { id } });
        requireAuth(context);
        requireAdmin(context);

        if (!topic) return false;

        await db.topic.delete({ where: { id } });
        return true;
      },

      // ============================================================================
      // CATEGORY MUTATIONS
      // ============================================================================

      createCategory: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        return await debugCreateCategory(input, context);
      },

      updateCategory: async (
        _: unknown,
        { id, input }: { id: string; input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const data = z
          .object({
            name: z.string().min(1).optional(),
            slug: z.string().min(1).optional(),
          })
          .parse(input);

        // Check if category exists
        const existingCategory = await db.category.findUnique({
          where: { id },
        });

        if (!existingCategory) {
          throw new Error('Category not found');
        }

        // If slug is being updated, check for conflicts
        if (data.slug && data.slug !== existingCategory.slug) {
          const slugConflict = await db.category.findUnique({
            where: { slug: data.slug },
          });

          if (slugConflict) {
            throw new Error('A category with this slug already exists');
          }
        }

        return await db.category.update({
          where: { id },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.slug && { slug: data.slug }),
          },
        });
      },

      deleteCategory: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);

        // Check if category exists
        const existingCategory = await db.category.findUnique({
          where: { id },
        });

        if (!existingCategory) {
          throw new Error('Category not found');
        }

        // Check if category has articles
        const articlesCount = await db.article.count({
          where: { categoryId: id },
        });

        if (articlesCount > 0) {
          throw new Error(
            `Cannot delete category. It has ${articlesCount} articles associated with it.`
          );
        }

        // Check if category has topics
        const topicsCount = await db.topic.count({
          where: { categoryId: id },
        });

        if (topicsCount > 0) {
          throw new Error(
            `Cannot delete category. It has ${topicsCount} topics associated with it.`
          );
        }

        await db.category.delete({ where: { id } });
        return true;
      },

      // ============================================================================
      // USER MANAGEMENT MUTATIONS
      // ============================================================================

      createUser: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { createUser } = await import('../services/userManagementService.js');

        return createUser(input, context.user!.id);
      },

      updateUserProfile: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        const { updateUserProfile } = await import('../services/userManagementService.js');

        return updateUserProfile(input, context.user!.id, context.user!.role === 'ADMIN');
      },

      updateUserRole: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { updateUserRole } = await import('../services/userManagementService.js');

        return updateUserRole(input, context.user!.id);
      },

      updateUserStatus: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { updateUserStatus } = await import('../services/userManagementService.js');

        return updateUserStatus(input, context.user!.id);
      },

      deleteUser: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);
        const { deleteUser } = await import('../services/userManagementService.js');

        return deleteUser(id, context.user!.id);
      },

      changePassword: async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        requireAuth(context);
        const { changePassword } = await import('../services/userManagementService.js');

        return changePassword(input);
      },

      requestPasswordReset: async (_: unknown, { input }: { input: any }) => {
        const { requestPasswordReset } = await import('../services/userManagementService.js');
        return requestPasswordReset(input);
      },

      resetPassword: async (_: unknown, { input }: { input: any }) => {
        const { resetPassword } = await import('../services/userManagementService.js');
        return resetPassword(input);
      },

      bulkUpdateUserRoles: async (
        _: unknown,
        { userIds, role }: { userIds: string[]; role: 'ADMIN' | 'EDITOR' | 'AUTHOR' },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { bulkUpdateUserRoles } = await import('../services/userManagementService.js');

        return bulkUpdateUserRoles(userIds, role, context.user!.id);
      },

      bulkUpdateUserStatus: async (
        _: unknown,
        { userIds, isActive }: { userIds: string[]; isActive: boolean },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { bulkUpdateUserStatus } = await import('../services/userManagementService.js');

        return bulkUpdateUserStatus(userIds, isActive, context.user!.id);
      },

      // Settings mutations
      updateSetting: async (
        _: unknown,
        { input }: { input: { key: string; value: any } },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const { key, value } = input;

        // Get setting configuration for validation
        const config = getSettingConfig(key);
        if (!config) {
          throw new Error(`Unknown setting key: ${key}`);
        }

        // TODO: Add validation based on config.validation

        // Upsert the setting
        const setting = await db.setting.upsert({
          where: { key },
          update: {
            value,
            updatedAt: new Date(),
          },
          create: {
            key,
            value,
            type: config.type,
            label: config.label,
            description: config.description,
            isPublic: config.isPublic ?? false,
            isRequired: config.isRequired ?? false,
          },
        });

        return setting;
      },

      updateSettings: async (
        _: unknown,
        { input }: { input: Array<{ key: string; value: any }> },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const results = [];

        for (const { key, value } of input) {
          // Get setting configuration for validation
          const config = getSettingConfig(key);
          if (!config) {
            throw new Error(`Unknown setting key: ${key}`);
          }

          // TODO: Add validation based on config.validation

          // Upsert the setting
          const setting = await db.setting.upsert({
            where: { key },
            update: {
              value,
              updatedAt: new Date(),
            },
            create: {
              key,
              value,
              type: config.type,
              label: config.label,
              description: config.description,
              isPublic: config.isPublic ?? false,
              isRequired: config.isRequired ?? false,
            },
          });

          results.push(setting);
        }

        return results;
      },

      resetSetting: async (_: unknown, { key }: { key: string }, context: GraphQLContext) => {
        requireAuth(context);
        requireAdmin(context);

        // Get setting configuration
        const config = getSettingConfig(key);
        if (!config) {
          throw new Error(`Unknown setting key: ${key}`);
        }

        // Reset to default value
        const setting = await db.setting.upsert({
          where: { key },
          update: {
            value: config.defaultValue,
            updatedAt: new Date(),
          },
          create: {
            key,
            value: config.defaultValue,
            type: config.type,
            label: config.label,
            description: config.description,
            isPublic: config.isPublic ?? false,
            isRequired: config.isRequired ?? false,
          },
        });

        return setting;
      },

      // ============================================================================
      // WORKFLOW MUTATIONS
      // ============================================================================

      performWorkflowAction: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        const { ArticleWorkflowService } = await import('../services/articleWorkflowService');
        return await ArticleWorkflowService.performWorkflowAction(context, input);
      },

      performBulkWorkflowAction: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        const { ArticleWorkflowService } = await import('../services/articleWorkflowService');
        return await ArticleWorkflowService.performBulkWorkflowAction(context, input);
      },

      markNotificationRead: async (
        _: unknown,
        { id }: { id: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);

        const notification = await db.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          throw new Error('Notification not found');
        }

        if (notification.toUserId !== context.user!.id) {
          throw new Error('Unauthorized to read this notification');
        }

        return db.notification.update({
          where: { id },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });
      },

      markAllNotificationsRead: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireAuth(context);

        const result = await db.notification.updateMany({
          where: {
            toUserId: context.user!.id,
            isRead: false,
          },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });

        return result.count;
      },

      requestArticleRevision: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const data = RevisionRequestInput.parse(input);

        const { PermissionService, Permission } = await import('../services/permissionService');
        const { AuditService, AuditEventType } = await import('../services/auditService');

        const article = await db.article.findUnique({
          where: { id: data.articleId },
          select: {
            id: true,
            status: true,
            authorId: true,
            revisionStatus: true,
            title: true,
          },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        if (article.status !== 'REVIEW') {
          throw new Error('Only articles in review can be revised');
        }

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          await AuditService.logPermissionDenied(
            context.user!.id,
            'REQUEST_REVISION',
            article.id,
            'Article',
            context.request
          );
          throw new Error('Permission denied: You cannot request revisions for this article');
        }

        const pendingRequest = await db.articleRevisionRequest.findFirst({
          where: { articleId: article.id, status: 'PENDING' },
          select: { id: true },
        });

        if (pendingRequest || article.revisionStatus === 'REQUESTED') {
          throw new Error('A revision request is already pending for this article');
        }

        const normalizedChanges = normalizeRevisionChanges(data.changes);

        const request = await db.$transaction(async (tx: Prisma.TransactionClient) => {
          const created = await tx.articleRevisionRequest.create({
            data: {
              articleId: article.id,
              requesterId: context.user!.id,
              note: data.note ?? null,
              proposedChanges: normalizedChanges,
              status: 'PENDING',
            },
            include: {
              article: true,
              requester: true,
              reviewedBy: true,
            },
          });

          await tx.article.update({
            where: { id: article.id },
            data: {
              revisionStatus: 'REQUESTED',
              revisionRequestedAt: new Date(),
            },
          });

          return created;
        });

        await AuditService.logArticleEvent(
          AuditEventType.REVISION_REQUESTED,
          context.user!.id,
          article.id,
          {
            title: article.title,
            note: data.note ?? undefined,
          },
          context.request
        );

        await sendRevisionNotifications({
          action: 'REVISION_REQUESTED',
          articleId: article.id,
          articleTitle: article.title,
          requestId: request.id,
          status: 'PENDING',
          performedById: context.user!.id,
          requesterId: request.requesterId ?? context.user!.id,
          authorId: article.authorId,
          note: data.note ?? null,
          message: data.note ?? undefined,
        });

        return request;
      },

      approveArticleRevision: async (
        _: unknown,
        { requestId, reviewComment }: { requestId: string; reviewComment?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const { AuditService, AuditEventType } = await import('../services/auditService');

        const request = await db.articleRevisionRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            status: true,
            articleId: true,
            proposedChanges: true,
            note: true,
            requesterId: true,
            article: {
              select: {
                id: true,
                title: true,
                authorId: true,
              },
            },
          },
        });

        if (!request) {
          throw new Error('Revision request not found');
        }

        if (request.status !== 'PENDING') {
          throw new Error('Only pending revision requests can be approved');
        }

        const changes = RevisionChangesInput.parse(request.proposedChanges || {});
        const normalizedChanges = normalizeRevisionChanges(changes);
        const includeBreaking = await hasBreakingColumn();

        let categoryId: string | null | undefined = undefined;
        if (changes.categorySlug !== undefined) {
          if (changes.categorySlug) {
            const category = await db.category.findFirst({
              where: { slug: changes.categorySlug },
              select: { id: true },
            });
            if (!category) {
              throw new Error(`Invalid category "${changes.categorySlug}"`);
            }
            categoryId = category.id;
          } else {
            categoryId = null;
          }
        }

        const payload: any = {
          revisionStatus: 'NONE',
          revisionRequestedAt: null,
          authorEditAllowance: 1,
        };

        if (normalizedChanges.title !== undefined) payload.title = normalizedChanges.title;
        if (normalizedChanges.excerpt !== undefined) payload.excerpt = normalizedChanges.excerpt ?? null;
        if (normalizedChanges.topic !== undefined) payload.topic = normalizedChanges.topic ?? null;
        if (normalizedChanges.contentJson !== undefined) payload.contentJson = normalizedChanges.contentJson;
        if (normalizedChanges.coverImageUrl !== undefined) payload.coverImageUrl = normalizedChanges.coverImageUrl;
        if (normalizedChanges.seoTitle !== undefined) payload.seoTitle = normalizedChanges.seoTitle;
        if (normalizedChanges.seoDescription !== undefined) {
          payload.seoDescription = normalizedChanges.seoDescription;
        }
        if (normalizedChanges.ogImageUrl !== undefined) payload.ogImageUrl = normalizedChanges.ogImageUrl;
        if (normalizedChanges.isFeatured !== undefined) payload.isFeatured = normalizedChanges.isFeatured;
        if (normalizedChanges.isEditorsPick !== undefined) {
          payload.isEditorsPick = normalizedChanges.isEditorsPick;
        }
        if (normalizedChanges.pinnedAt !== undefined) {
          payload.pinnedAt = normalizedChanges.pinnedAt ? new Date(normalizedChanges.pinnedAt) : null;
        }

        if (normalizedChanges.isBreaking !== undefined && includeBreaking) {
          payload.isBreaking = normalizedChanges.isBreaking;
        }

        if (categoryId !== undefined) {
          payload.categoryId = categoryId;
        }

        const select = await getArticleSelect();

        const updatedArticle = await db.$transaction(async (tx: Prisma.TransactionClient) => {
          const article = await tx.article.update({
            where: { id: request.articleId },
            data: payload,
            select,
          });

          if (normalizedChanges.tagSlugs) {
            await tx.articleTag.deleteMany({
              where: { articleId: request.articleId },
            });

            for (const slug of normalizedChanges.tagSlugs) {
              const tag = await tx.tag.upsert({
                where: { slug },
                update: {},
                create: { slug, name: slug },
              });

              await tx.articleTag.create({
                data: { articleId: request.articleId, tagId: tag.id },
              });
            }
          }

          await tx.articleRevisionRequest.update({
            where: { id: requestId },
            data: {
              status: 'APPROVED',
              reviewedById: context.user!.id,
              reviewedAt: new Date(),
              reviewComment: reviewComment ?? null,
            },
          });

          await tx.articleRevision.create({
            data: {
              articleId: request.articleId,
              revisionRequestId: requestId,
              appliedById: context.user!.id,
              summary: reviewComment ?? request.note ?? null,
              changes: normalizedChanges,
            },
          });

          return article;
        });

        await AuditService.logArticleEvent(
          AuditEventType.REVISION_APPROVED,
          context.user!.id,
          request.articleId,
          {
            requestId,
            reviewComment: reviewComment ?? undefined,
          },
          context.request
        );

        await sendRevisionNotifications({
          action: 'REVISION_APPROVED',
          articleId: request.articleId,
          articleTitle: request.article.title,
          requestId,
          status: 'APPROVED',
          performedById: context.user!.id,
          requesterId: request.requesterId,
          reviewerId: context.user!.id,
          authorId: request.article.authorId,
          reviewComment: reviewComment ?? null,
          message: reviewComment ?? undefined,
        });

        return updatedArticle;
      },

      rejectArticleRevision: async (
        _: unknown,
        { requestId, reviewComment }: { requestId: string; reviewComment?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const { AuditService, AuditEventType } = await import('../services/auditService');

        const request = await db.articleRevisionRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            articleId: true,
            status: true,
            requesterId: true,
            article: {
              select: {
                id: true,
                title: true,
                authorId: true,
              },
            },
          },
        });

        if (!request) {
          throw new Error('Revision request not found');
        }

        if (request.status !== 'PENDING') {
          throw new Error('Only pending revision requests can be rejected');
        }

        const updatedRequest = await db.$transaction(async (tx: Prisma.TransactionClient) => {
          const revisionRequest = await tx.articleRevisionRequest.update({
            where: { id: requestId },
            data: {
              status: 'REJECTED',
              reviewedById: context.user!.id,
              reviewedAt: new Date(),
              reviewComment: reviewComment ?? null,
            },
            include: {
              article: true,
              requester: true,
              reviewedBy: true,
            },
          });

          await tx.article.update({
            where: { id: request.articleId },
            data: {
              revisionStatus: 'NONE',
              revisionRequestedAt: null,
            },
          });

          return revisionRequest;
        });

        await AuditService.logArticleEvent(
          AuditEventType.REVISION_REJECTED,
          context.user!.id,
          request.articleId,
          {
            requestId,
            reviewComment: reviewComment ?? undefined,
          },
          context.request
        );

        await sendRevisionNotifications({
          action: 'REVISION_REJECTED',
          articleId: request.articleId,
          articleTitle: request.article.title,
          requestId,
          status: 'REJECTED',
          performedById: context.user!.id,
          requesterId: request.requesterId,
          reviewerId: context.user!.id,
          authorId: request.article.authorId,
          reviewComment: reviewComment ?? null,
          message: reviewComment ?? undefined,
        });

        return updatedRequest;
      },

      consumeArticleRevision: async (
        _: unknown,
        { requestId }: { requestId: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { PermissionService, Permission } = await import('../services/permissionService');

        const request = await db.articleRevisionRequest.findUnique({
          where: { id: requestId },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
            consumedBy: true,
          },
        });

        if (!request) {
          throw new Error('Revision request not found');
        }

        const userRole = context.user!.role as any;
        const isOwner = request.article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          throw new Error('Permission denied: You cannot consume this revision request');
        }

        if (request.consumedAt) return request;

        if (request.status !== 'APPROVED' && request.status !== 'REJECTED') {
          throw new Error('Only approved or rejected revision requests can be consumed');
        }

        const updatedRequest = await db.articleRevisionRequest.update({
          where: { id: requestId },
          data: {
            consumedAt: new Date(),
            consumedById: context.user!.id,
          },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
            consumedBy: true,
          },
        });

        await sendRevisionNotifications({
          action: 'REVISION_CONSUMED',
          articleId: updatedRequest.articleId,
          articleTitle: updatedRequest.article.title,
          requestId,
          status: updatedRequest.status,
          performedById: context.user!.id,
          requesterId: updatedRequest.requesterId,
          reviewerId: updatedRequest.reviewedById,
          consumedById: updatedRequest.consumedById,
          authorId: updatedRequest.article.authorId,
        });

        return updatedRequest;
      },

      requestBreakingNews: async (
        _: unknown,
        { articleId, reason }: { articleId: string; reason?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);

        const { PermissionService, Permission } = await import('../services/permissionService');
        const { AuditService, AuditEventType } = await import('../services/auditService');

        const article = await db.article.findUnique({
          where: { id: articleId },
          select: {
            id: true,
            status: true,
            authorId: true,
            isBreaking: true,
            title: true,
          },
        });

        if (!article) {
          throw new Error('Article not found');
        }

        if (article.isBreaking) {
          throw new Error('Article is already marked as breaking news');
        }

        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
          await AuditService.logPermissionDenied(
            context.user!.id,
            'REQUEST_BREAKING_NEWS',
            article.id,
            'Article',
            context.request
          );
          throw new Error('Permission denied: You cannot request breaking news for this article');
        }

        const pendingRequest = await db.breakingNewsRequest.findFirst({
          where: { articleId: article.id, status: 'PENDING' },
          select: { id: true },
        });

        if (pendingRequest) {
          throw new Error('A breaking news request is already pending for this article');
        }

        const request = await db.breakingNewsRequest.create({
          data: {
            articleId: article.id,
            requesterId: context.user!.id,
            reason: reason ?? null,
            status: 'PENDING',
          },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
          },
        });

        await db.article.update({
          where: { id: article.id },
          data: {
            breakingNewsRequestStatus: 'PENDING',
            breakingNewsRequestedAt: new Date(),
            breakingNewsRequestedById: context.user!.id,
          },
        });

        await AuditService.logArticleEvent(
          AuditEventType.BREAKING_NEWS_REQUESTED,
          context.user!.id,
          article.id,
          {
            title: article.title,
            reason: reason ?? undefined,
          },
          context.request
        );

        return request;
      },

      approveBreakingNews: async (
        _: unknown,
        { requestId, reviewComment }: { requestId: string; reviewComment?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const { AuditService, AuditEventType } = await import('../services/auditService');

        const request = await db.breakingNewsRequest.findUnique({
          where: { id: requestId },
          include: {
            article: true,
          },
        });

        if (!request) {
          throw new Error('Breaking news request not found');
        }

        if (request.status !== 'PENDING') {
          throw new Error('Only pending breaking news requests can be approved');
        }

        const includeBreaking = await hasBreakingColumn();
        if (!includeBreaking) {
          throw new Error('Breaking news feature is not available');
        }

        const updatedRequest = await db.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.article.update({
            where: { id: request.articleId },
            data: {
              isBreaking: true,
              breakingNewsRequestStatus: 'APPROVED',
            },
          });

          return tx.breakingNewsRequest.update({
            where: { id: requestId },
            data: {
              status: 'APPROVED',
              reviewedById: context.user!.id,
              reviewedAt: new Date(),
              reviewComment: reviewComment ?? null,
            },
            include: {
              article: true,
              requester: true,
              reviewedBy: true,
            },
          });
        });

        await AuditService.logArticleEvent(
          AuditEventType.BREAKING_NEWS_APPROVED,
          context.user!.id,
          request.articleId,
          {
            requestId,
            reviewComment: reviewComment ?? undefined,
          },
          context.request
        );

        return updatedRequest;
      },

      rejectBreakingNews: async (
        _: unknown,
        { requestId, reviewComment }: { requestId: string; reviewComment?: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);

        const { AuditService, AuditEventType } = await import('../services/auditService');

        const request = await db.breakingNewsRequest.findUnique({
          where: { id: requestId },
          select: { id: true, articleId: true, status: true },
        });

        if (!request) {
          throw new Error('Breaking news request not found');
        }

        if (request.status !== 'PENDING') {
          throw new Error('Only pending breaking news requests can be rejected');
        }

        const updatedRequest = await db.breakingNewsRequest.update({
          where: { id: requestId },
          data: {
            status: 'REJECTED',
            reviewedById: context.user!.id,
            reviewedAt: new Date(),
            reviewComment: reviewComment ?? null,
          },
          include: {
            article: true,
            requester: true,
            reviewedBy: true,
          },
        });

        await db.article.update({
          where: { id: request.articleId },
          data: {
            breakingNewsRequestStatus: 'REJECTED',
          },
        });

        await AuditService.logArticleEvent(
          AuditEventType.BREAKING_NEWS_REJECTED,
          context.user!.id,
          request.articleId,
          {
            requestId,
            reviewComment: reviewComment ?? undefined,
          },
          context.request
        );

        return updatedRequest;
      },

      // Registration Request Mutations
      ...registrationRequestResolvers.Mutation,
    },

  },
});

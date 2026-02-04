import { createSchema } from "graphql-yoga";
import { prisma } from "../lib/prisma";
import { GraphQLJSONObject } from "graphql-scalars";
import { z } from "zod";
import { registerUser, loginUser, getCurrentUser } from "../resolvers/auth";
import { debugArticles } from "../resolvers/debug";
import { GraphQLContext, requireAuth, requireEditor, requireAdmin } from "../middleware/auth";

import { searchArticles, getSearchSuggestions, SearchInput } from "../services/searchService";
import { getRelatedArticles, RelatedArticlesInput } from "../services/relatedArticlesService";
import { SETTINGS_CONFIG, getSettingConfig } from "../data/settings-config";

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
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).optional(),
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

function toIso(d?: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function normalizeTagSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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
        console.warn(
          "Failed to add Article.isBreaking column automatically.",
          error
        );
        breakingColumnAvailable = false;
        return false;
      }
    }

    breakingColumnAvailable = true;
  } catch (error) {
    console.warn("Failed to check for Article.isBreaking column.", error);
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
export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    scalar JSON

    enum ArticleStatus {
      DRAFT
      REVIEW
      PUBLISHED
      ARCHIVED
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

      publishedAt: String
      createdAt: String!
      updatedAt: String!

      category: Category
      author: User
      tags: [Tag!]
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
      # Authentication queries
      me: AuthResponse!
      debugAuth: DebugAuthResponse!
      debugArticles: DebugAuthResponse!
      
      # Content queries
      categories: [Category!]!

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
      
      # Settings queries
      settings(type: SettingType): [Setting!]!
      setting(key: String!): Setting
      publicSettings: [Setting!]!
    }

    type Mutation {
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
      description: String
    }

    input UpdateCategoryInput {
      name: String
      slug: String
      description: String
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

    input UpdateSettingInput {
      key: String!
      value: JSON!
    }
  `,

  resolvers: {
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

    Article: {
      createdAt: (p: any) => toIso(p.createdAt),
      updatedAt: (p: any) => toIso(p.updatedAt),
      publishedAt: (p: any) => toIso(p.publishedAt),
      pinnedAt: (p: any) => toIso(p.pinnedAt),
      isBreaking: (p: any) => p.isBreaking ?? false,

      category: async (parent: any) => {
        if (!parent.categoryId) return null;
        return db.category.findUnique({ where: { id: parent.categoryId } });
      },

      tags: async (parent: any) => {
        // Article -> ArticleTag[] (tags)
        // Tag -> ArticleTag[] (articles)
        return db.tag.findMany({
          where: { articles: { some: { articleId: parent.id } } },
          orderBy: { name: "asc" },
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

    Query: {
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
        console.log('🔍 Debug Auth endpoint called');
        
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
              }
            };
          }

          const userRole = context.user.role;
          const hasCreateArticle = PermissionService.hasPermission(userRole as any, Permission.CREATE_ARTICLE);
          const hasUpdateAny = PermissionService.hasPermission(userRole as any, Permission.UPDATE_ANY_ARTICLE);
          const hasReviewArticles = PermissionService.hasPermission(userRole as any, Permission.REVIEW_ARTICLES);

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
              rolePermissions: PermissionService.getRolePermissions(userRole as any),
              timestamp: new Date().toISOString(),
            }
          };
        } catch (error) {
          console.error('🔍 Debug Auth error:', error);
          return {
            success: false,
            message: 'Debug auth failed',
            debug: {
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            }
          };
        }
      },

      debugArticles,

      categories: async () =>
        db.category.findMany({ orderBy: { name: "asc" } }),

      articles: async (_: unknown, args: any, context: GraphQLContext) => {
        console.log('🔍 Articles resolver called with args:', JSON.stringify(args));
        
        try {
          // Require authentication for articles management
          requireAuth(context);
          console.log('🔍 Authentication successful for user:', context.user!.email, 'role:', context.user!.role);
          
          // Import permission services with static import for better reliability
          const { PermissionService, Permission } = await import('../services/permissionService');
          console.log('🔍 Permission services imported successfully');
          
          const userRole = context.user!.role;
          const userId = context.user!.id;
          console.log('🔍 User details - ID:', userId, 'Role:', userRole, 'Email:', context.user!.email);
          
          // Build where clause for filtering
          const where: any = {};

          if (args.status) {
            where.status = args.status;
            console.log('🔍 Filtering by status:', args.status);
          }
          
          if (args.topic) {
            where.topic = args.topic;
            console.log('🔍 Filtering by topic:', args.topic);
          }

          if (args.categorySlug) {
            where.category = { is: { slug: args.categorySlug } };
            console.log('🔍 Filtering by category slug:', args.categorySlug);
          }

          // Handle explicit authorId parameter (for "My Articles" page)
          if (args.authorId) {
            where.authorId = args.authorId;
            console.log('🔍 Explicit authorId filter applied:', args.authorId);
          } else {
            // Apply role-based filtering for general articles access
            console.log('🔍 Checking permissions for role:', userRole);
            
            // Check if user has permission to see all articles
            const hasUpdateAnyPermission = PermissionService.hasPermission(userRole as any, Permission.UPDATE_ANY_ARTICLE);
            console.log('🔍 User has UPDATE_ANY_ARTICLE permission:', hasUpdateAnyPermission);
            
            if (!hasUpdateAnyPermission) {
              // Authors can only see their own articles
              where.authorId = userId;
              console.log('🔍 Restricting to user\'s own articles only (authorId:', userId, ')');
            } else {
              console.log('🔍 User can access all articles (Admin/Editor permissions)');
            }
          }

          console.log('🔍 Final database query where clause:', JSON.stringify(where, null, 2));

          const select = await getArticleSelect();
          console.log('🔍 Article select fields prepared');

          const articles = await db.article.findMany({
            where,
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: args.take ?? 20,
            skip: args.skip ?? 0,
            select,
          });
          
          console.log('🔍 Database query completed. Found', articles.length, 'articles');
          console.log('🔍 Article IDs found:', articles.map(a => a.id).slice(0, 5), articles.length > 5 ? '...' : '');
          
          return articles;
          
        } catch (error) {
          console.error('🔍 Error in articles resolver:', error);
          console.error('🔍 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
          throw error; // Re-throw to let GraphQL handle the error response
        }
      },

      articleBySlug: async (_: unknown, { slug }: { slug: string }) => {
        const select = await getArticleSelect();

        return db.article.findFirst({
          where: {
            slug,
            status: "PUBLISHED", // Only show published articles
          },
          select,
        });
      },

      articleById: async (_: unknown, { id }: { id: string }) => {
        const select = await getArticleSelect();

        return db.article.findUnique({
          where: { id },
          select,
        });
      },

      topStories: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isFeatured: true, status: "PUBLISHED" },
          orderBy: [
            // null-safe ordering
            { pinnedAt: { sort: "desc", nulls: "last" } },
            { publishedAt: "desc" },
          ],
          take: limit ?? 6,
          select,
        });
      },

      editorsPicks: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isEditorsPick: true, status: "PUBLISHED" },
          orderBy: [
            { pinnedAt: { sort: "desc", nulls: "last" } },
            { publishedAt: "desc" },
          ],
          take: limit ?? 6,
          select,
        });
      },

      breakingNews: async (_: unknown, { limit }: { limit?: number }) => {
        const includeBreaking = await hasBreakingColumn();
        if (!includeBreaking) return [];

        const select = await getArticleSelect();

        return db.article.findMany({
          where: { isBreaking: true, status: "PUBLISHED" },
          orderBy: [
            { pinnedAt: { sort: "desc", nulls: "last" } },
            { publishedAt: "desc" },
          ],
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
            status: "PUBLISHED",
            category: { is: { slug: categorySlug } },
          },
          orderBy: { publishedAt: "desc" },
          take: limit ?? 6,
          select,
        });
      },

      trending: async (_: unknown, { limit }: { limit?: number }) => {
        const select = await getArticleSelect();

        return db.article.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { viewCount: "desc" },
          take: limit ?? 10,
          select,
        });
      },

      relatedArticles: async (
        _: unknown,
        { slug, limit }: { slug: string; limit?: number }
      ) => {
        // Keep the original simple implementation for backward compatibility
        const select = await getArticleSelect();
        const article = await db.article.findFirst({
          where: { slug },
          select: { ...select, tags: true }, // ArticleTag[]
        });

        if (!article) return [];

        const tagIds = (article.tags ?? [])
          .map((t: any) => t.tagId)
          .filter(Boolean);
        if (!tagIds.length) return [];

        return db.article.findMany({
          where: {
            status: "PUBLISHED",
            id: { not: article.id },
            tags: { some: { tagId: { in: tagIds } } },
          },
          orderBy: { publishedAt: "desc" },
          take: limit ?? 6,
          select,
        });
      },

      enhancedRelatedArticles: async (
        _: unknown,
        { input }: { input: any }
      ) => {
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

      topicsByCategory: async (
        _: unknown,
        { categorySlug }: { categorySlug: string }
      ) => {
        const category = await db.category.findUnique({
          where: { slug: categorySlug },
          select: { id: true },
        });

        if (!category) return [];

        return db.topic.findMany({
          where: { categoryId: category.id },
          orderBy: { title: "asc" },
        });
      },

      // Search resolvers
      searchArticles: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
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

      listUsers: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { listUsers } = await import('../services/userManagementService.js');
        
        return listUsers(input, context.user!.id);
      },

      getUserById: async (
        _: unknown,
        { id }: { id: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { getUserById } = await import('../services/userManagementService.js');
        
        return getUserById(id, context.user!.id, context.user!.role === 'ADMIN');
      },

      getUserStats: async (
        _: unknown,
        __: unknown,
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { getUserStats } = await import('../services/userManagementService.js');
        
        return getUserStats();
      },

      getBasicStats: async (
        _: unknown,
        __: unknown,
        context: GraphQLContext
      ) => {
        requireAuth(context);
        // Note: Only requires authentication, not admin role
        
        try {
          // Get basic counts that are safe for all authenticated users
          const totalUsers = await prisma.user.count({
            where: { isActive: true }
          });
          
          const totalArticles = await prisma.article.count();
          
          return {
            totalUsers,
            totalArticles
          };
        } catch (error) {
          console.error('🔍 Backend Debug - Error in getBasicStats:', error);
          // Return zeros if query fails
          return {
            totalUsers: 0,
            totalArticles: 0
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
          orderBy: { key: 'asc' }
        });
        
        // Filter out private settings for non-admin users and handle corrupted JSON values
        const validSettings = settings
          .filter(setting => setting.isPublic || isAdmin)
          .filter(setting => {
            // Check if the value is valid JSON
            try {
              if (setting.value === null || setting.value === undefined) {
                console.warn(`⚠️  Setting ${setting.key} has null/undefined value, skipping`);
                return false;
              }
              
              // Check for asterisk corruption
              const valueStr = String(setting.value);
              if (valueStr.includes('*') && valueStr.trim() === '*') {
                console.warn(`⚠️  Setting ${setting.key} has corrupted value: ${valueStr}, skipping`);
                return false;
              }
              
              // Try to parse as JSON to validate
              JSON.parse(JSON.stringify(setting.value));
              return true;
            } catch (error) {
              console.warn(`⚠️  Setting ${setting.key} has invalid JSON value: ${setting.value}, skipping`);
              return false;
            }
          });
        
        console.log(`📊 Settings query: ${validSettings.length}/${settings.length} valid settings returned`);
        return validSettings;
      },

      setting: async (_: unknown, { key }: { key: string }, context: GraphQLContext) => {
        const setting = await db.setting.findUnique({
          where: { key }
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
            console.warn(`⚠️  Setting ${setting.key} has null/undefined value`);
            return null;
          }
          
          // Check for asterisk corruption
          const valueStr = String(setting.value);
          if (valueStr.includes('*') && valueStr.trim() === '*') {
            console.warn(`⚠️  Setting ${setting.key} has corrupted value: ${valueStr}`);
            return null;
          }
          
          // Try to parse as JSON to validate
          JSON.parse(JSON.stringify(setting.value));
          return setting;
        } catch (error) {
          console.warn(`⚠️  Setting ${setting.key} has invalid JSON value: ${setting.value}`);
          return null;
        }
      },

      publicSettings: async () => {
        const settings = await db.setting.findMany({
          where: { isPublic: true },
          orderBy: { key: 'asc' }
        });
        
        // Filter out corrupted JSON values
        const validSettings = settings.filter(setting => {
          try {
            if (setting.value === null || setting.value === undefined) {
              console.warn(`⚠️  Public setting ${setting.key} has null/undefined value, skipping`);
              return false;
            }
            
            // Check for asterisk corruption
            const valueStr = String(setting.value);
            if (valueStr.includes('*') && valueStr.trim() === '*') {
              console.warn(`⚠️  Public setting ${setting.key} has corrupted value: ${valueStr}, skipping`);
              return false;
            }
            
            // Try to parse as JSON to validate
            JSON.parse(JSON.stringify(setting.value));
            return true;
          } catch (error) {
            console.warn(`⚠️  Public setting ${setting.key} has invalid JSON value: ${setting.value}, skipping`);
            return false;
          }
        });
        
        console.log(`📊 Public settings query: ${validSettings.length}/${settings.length} valid settings returned`);
        return validSettings;
      },

      // ============================================================================
      // WORKFLOW QUERIES
      // ============================================================================

      reviewQueue: async (
        _: unknown,
        { filters }: { filters?: any },
        context: GraphQLContext
      ) => {
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
          select: { status: true, authorId: true }
        });

        if (!article) {
          throw new Error('Article not found');
        }

        const { PermissionService } = await import('../services/permissionService');
        const userRole = context.user!.role as any;
        const isOwner = article.authorId === context.user!.id;

        return PermissionService.getAvailableWorkflowActions(userRole, article.status, isOwner);
      },
    },

    Mutation: {
      register: async (_: unknown, { input }: any) => {
        return registerUser(input);
      },

      login: async (_: unknown, { input }: any) => {
        return loginUser(input);
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
            select: { id: true, authorId: true, status: true, title: true }
          });
          
          if (!existingArticle) {
            throw new Error('Article not found');
          }
        }
        
        // Permission checks for article operations
        if (existingArticle) {
          // Updating existing article
          const isOwner = existingArticle.authorId === context.user!.id;
          
          if (!isOwner && !PermissionService.hasPermission(userRole, Permission.UPDATE_ANY_ARTICLE)) {
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
          const hasFeatureChanges = data.isFeatured !== undefined || 
                                   data.isEditorsPick !== undefined || 
                                   data.isBreaking !== undefined;
          
          if (hasFeatureChanges && !PermissionService.canSetArticleFeatures(userRole)) {
            throw new Error('Permission denied: You cannot set article features (featured, breaking news, editor\'s pick)');
          }
          
          // Check if user can change article status
          if (data.status && data.status !== existingArticle.status) {
            console.log('🔍 GraphQL upsertArticle status change check:', {
              userId: context.user!.id,
              userRole,
              userRoleType: typeof userRole,
              existingStatus: existingArticle.status,
              newStatus: data.status,
              isOwner,
              authorId: existingArticle.authorId
            });
            
            if (!PermissionService.canPerformWorkflowAction(userRole, existingArticle.status, data.status, isOwner)) {
              console.log('❌ Permission denied for status change');
              throw new Error(`Permission denied: Cannot change article status from ${existingArticle.status} to ${data.status}`);
            }
            
            console.log('✅ Permission granted for status change');
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
            throw new Error('Permission denied: You cannot set article features (featured, breaking news, editor\'s pick)');
          }
          
          // Authors can only create drafts or submit for review
          if (userRole === 'AUTHOR' && data.status && !['DRAFT', 'REVIEW'].includes(data.status)) {
            throw new Error('Permission denied: Authors can only create drafts or submit articles for review');
          }
        }
        const includeBreaking = await hasBreakingColumn();

        // Enhanced category assignment with validation and fallback
        let category = null;
        let categoryAssignmentLog = "";

        if (data.categorySlug) {
          // Try to find the requested category
          category = await db.category.findFirst({
            where: { slug: data.categorySlug },
            select: { id: true, slug: true, name: true },
          });

          if (category) {
            categoryAssignmentLog = `✅ Found category: ${category.slug} (${category.name})`;
          } else {
            // Category not found - return error with available categories
            const availableCategories = await db.category.findMany({
              select: { slug: true, name: true },
              orderBy: { slug: 'asc' }
            });

            const availableSlugs = availableCategories.map(c => c.slug).join(', ');
            throw new Error(`Invalid category "${data.categorySlug}". Available categories: ${availableSlugs}`);
          }
        } else {
          categoryAssignmentLog = "ℹ️ No categorySlug provided";
        }

        // Comprehensive debug logging
        console.log('🔍 Category assignment debug:', {
          requestedCategorySlug: data.categorySlug,
          topic: data.topic,
          assignedCategory: category ? { id: category.id, slug: category.slug, name: category.name } : null,
          log: categoryAssignmentLog
        });

        const status = data.status ?? "DRAFT";

        const payload: any = {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt ?? null,
          status,
          topic: data.topic ?? null,
          contentJson: data.contentJson ?? {
            time: Date.now(),
            blocks: [],
            version: "2.x",
          },

          isFeatured: data.isFeatured ?? false,
          isEditorsPick: data.isEditorsPick ?? false,
          pinnedAt: data.pinnedAt ? new Date(data.pinnedAt) : null,

          authorName: data.authorName ?? context.user.name,
          // Set authorId if the relationship exists in the schema
          ...(context.user.id && { authorId: context.user.id }),
          coverImageUrl: data.coverImageUrl ?? null,

          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          ogImageUrl: data.ogImageUrl ?? null,

          categoryId: category?.id ?? null,
        };

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
          } else {
            article = await db.article.create({
              data: {
                ...payload,
                publishedAt: status === "PUBLISHED" ? new Date() : null,
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

          const unique = Array.from(
            new Set(data.tagSlugs.map(normalizeTagSlug).filter(Boolean))
          );

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
        const eventType = existingArticle ? AuditEventType.ARTICLE_UPDATED : AuditEventType.ARTICLE_CREATED;
        await AuditService.logArticleEvent(
          eventType,
          context.user!.id,
          article.id,
          {
            title: article.title,
            status: article.status,
            isUpdate: !!existingArticle,
            changes: existingArticle ? {
              statusChanged: data.status && data.status !== existingArticle.status,
              featuresChanged: data.isFeatured !== undefined || data.isEditorsPick !== undefined || data.isBreaking !== undefined
            } : undefined
          },
          context.request
        );

        return article;
      },

      setArticleStatus: async (_: unknown, { id, status }: any, context: GraphQLContext) => {
        // Require authentication
        requireAuth(context);
        
        // Require editor permissions for publishing articles
        if (status === "PUBLISHED") {
          requireEditor(context);
        }
        
        return db.article.update({
          where: { id },
          data: {
            status,
            publishedAt: status === "PUBLISHED" ? new Date() : null,
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
            wasOwner: isOwner
          },
          context.request
        );

        return true;
      },

      upsertTopic: async (_: unknown, { id, input }: any) => {
        const data = TopicInput.parse(input);

        const category = await db.category.findUnique({
          where: { slug: data.categorySlug },
          select: { id: true },
        });

        if (!category) throw new Error("Category not found");

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

      deleteTopic: async (_: unknown, { id }: { id: string }) => {
        const topic = await db.topic.findUnique({ where: { id } });
        if (!topic) return false;

        await db.topic.delete({ where: { id } });
        return true;
      },

      // ============================================================================
      // CATEGORY MUTATIONS
      // ============================================================================

      createCategory: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireEditor(context);

        const data = z.object({
          name: z.string().min(1, "Name is required"),
          slug: z.string().min(1, "Slug is required"),
          description: z.string().optional().nullable(),
        }).parse(input);

        // Check if slug already exists
        const existingCategory = await db.category.findUnique({
          where: { slug: data.slug }
        });

        if (existingCategory) {
          throw new Error("A category with this slug already exists");
        }

        return await db.category.create({
          data: {
            name: data.name,
            slug: data.slug,
            description: data.description,
          }
        });
      },

      updateCategory: async (
        _: unknown,
        { id, input }: { id: string; input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireEditor(context);

        const data = z.object({
          name: z.string().min(1).optional(),
          slug: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
        }).parse(input);

        // Check if category exists
        const existingCategory = await db.category.findUnique({
          where: { id }
        });

        if (!existingCategory) {
          throw new Error("Category not found");
        }

        // If slug is being updated, check for conflicts
        if (data.slug && data.slug !== existingCategory.slug) {
          const slugConflict = await db.category.findUnique({
            where: { slug: data.slug }
          });

          if (slugConflict) {
            throw new Error("A category with this slug already exists");
          }
        }

        return await db.category.update({
          where: { id },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.slug && { slug: data.slug }),
            ...(data.description !== undefined && { description: data.description }),
          }
        });
      },

      deleteCategory: async (
        _: unknown,
        { id }: { id: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireEditor(context);

        // Check if category exists
        const existingCategory = await db.category.findUnique({
          where: { id }
        });

        if (!existingCategory) {
          throw new Error("Category not found");
        }

        // Check if category has articles
        const articlesCount = await db.article.count({
          where: { categoryId: id }
        });

        if (articlesCount > 0) {
          throw new Error(`Cannot delete category. It has ${articlesCount} articles associated with it.`);
        }

        // Check if category has topics
        const topicsCount = await db.topic.count({
          where: { categoryId: id }
        });

        if (topicsCount > 0) {
          throw new Error(`Cannot delete category. It has ${topicsCount} topics associated with it.`);
        }

        await db.category.delete({ where: { id } });
        return true;
      },

      // ============================================================================
      // USER MANAGEMENT MUTATIONS
      // ============================================================================

      createUser: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { createUser } = await import('../services/userManagementService.js');
        
        return createUser(input, context.user!.id);
      },

      updateUserProfile: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { updateUserProfile } = await import('../services/userManagementService.js');
        
        return updateUserProfile(
          input,
          context.user!.id,
          context.user!.role === 'ADMIN'
        );
      },

      updateUserRole: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { updateUserRole } = await import('../services/userManagementService.js');
        
        return updateUserRole(input, context.user!.id);
      },

      updateUserStatus: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { updateUserStatus } = await import('../services/userManagementService.js');
        
        return updateUserStatus(input, context.user!.id);
      },

      deleteUser: async (
        _: unknown,
        { id }: { id: string },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        requireAdmin(context);
        const { deleteUser } = await import('../services/userManagementService.js');
        
        return deleteUser(id, context.user!.id);
      },

      changePassword: async (
        _: unknown,
        { input }: { input: any },
        context: GraphQLContext
      ) => {
        requireAuth(context);
        const { changePassword } = await import('../services/userManagementService.js');
        
        return changePassword(input);
      },

      requestPasswordReset: async (
        _: unknown,
        { input }: { input: any }
      ) => {
        const { requestPasswordReset } = await import('../services/userManagementService.js');
        return requestPasswordReset(input);
      },

      resetPassword: async (
        _: unknown,
        { input }: { input: any }
      ) => {
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
            updatedAt: new Date()
          },
          create: {
            key,
            value,
            type: config.type,
            label: config.label,
            description: config.description,
            isPublic: config.isPublic ?? false,
            isRequired: config.isRequired ?? false
          }
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
              updatedAt: new Date()
            },
            create: {
              key,
              value,
              type: config.type,
              label: config.label,
              description: config.description,
              isPublic: config.isPublic ?? false,
              isRequired: config.isRequired ?? false
            }
          });
          
          results.push(setting);
        }
        
        return results;
      },

      resetSetting: async (
        _: unknown,
        { key }: { key: string },
        context: GraphQLContext
      ) => {
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
            updatedAt: new Date()
          },
          create: {
            key,
            value: config.defaultValue,
            type: config.type,
            label: config.label,
            description: config.description,
            isPublic: config.isPublic ?? false,
            isRequired: config.isRequired ?? false
          }
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
    },
  },
});

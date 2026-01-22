import { createSchema } from "graphql-yoga";
import { prisma } from "../lib/prisma";
import { GraphQLJSONObject } from "graphql-scalars";
import { z } from "zod";
import { registerUser, loginUser, getCurrentUser } from "../resolvers/auth";
import { GraphQLContext, requireAuth, requireEditor } from "../middleware/auth";
import { searchArticles, getSearchSuggestions, SearchInput } from "../services/searchService";
import { getRelatedArticles, RelatedArticlesInput } from "../services/relatedArticlesService";

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

    type AuthResponse {
      success: Boolean!
      message: String!
      token: String
      user: User
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
      
      # Content queries
      categories: [Category!]!

      articles(
        status: ArticleStatus
        categorySlug: String
        topic: String
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
      getUserActivity(userId: ID, limit: Int = 50): [ActivityLog!]!
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
      
      # User management mutations
      updateUserProfile(input: UpdateUserProfileInput!): UserManagementResult!
      updateUserRole(input: UpdateUserRoleInput!): UserManagementResult!
      updateUserStatus(input: UpdateUserStatusInput!): UserManagementResult!
      deleteUser(id: ID!): UserManagementResult!
      changePassword(input: ChangePasswordInput!): PasswordResetResult!
      requestPasswordReset(input: RequestPasswordResetInput!): PasswordResetResult!
      resetPassword(input: ResetPasswordInput!): PasswordResetResult!
      bulkUpdateUserRoles(userIds: [ID!]!, role: UserRole!): UserManagementResult!
      bulkUpdateUserStatus(userIds: [ID!]!, isActive: Boolean!): UserManagementResult!
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

    type ActivityLog {
      id: ID!
      userId: String!
      activityType: String!
      details: JSON
      performedBy: String!
      timestamp: String!
      user: User
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

      categories: async () =>
        db.category.findMany({ orderBy: { name: "asc" } }),

      articles: async (_: unknown, args: any) => {
        const where: any = {};

        if (args.status) where.status = args.status;
        if (args.topic) where.topic = args.topic;

        if (args.categorySlug) {
          where.category = { is: { slug: args.categorySlug } };
        }

        const select = await getArticleSelect();

        return db.article.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: args.take ?? 20,
          skip: args.skip ?? 0,
          select,
        });
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
        const includeBreaking = await hasBreakingColumn();

        const category = data.categorySlug
          ? await db.category.findFirst({
              where: { slug: data.categorySlug },
              select: { id: true },
            })
          : null;

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

      deleteArticle: async (_: unknown, { id }: { id: string }) => {
        const article = await db.article.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!article) return false;

        await db.articleTag.deleteMany({
          where: { articleId: id },
        });

        await db.article.delete({
          where: { id },
          select: { id: true },
        });

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
      // USER MANAGEMENT MUTATIONS
      // ============================================================================

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
    },
  },
});

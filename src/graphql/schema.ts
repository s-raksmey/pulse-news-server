import { createSchema } from "graphql-yoga";
import { prisma } from "../lib/prisma";
import { GraphQLJSONObject } from "graphql-scalars";
import { z } from "zod";

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
      topicBySlug(categorySlug: String!, topicSlug: String!): Topic
      topicsByCategory(categorySlug: String!): [Topic!]!
    }

    type Mutation {
      upsertArticle(id: ID, input: UpsertArticleInput!): Article!
      setArticleStatus(id: ID!, status: ArticleStatus!): Article!
      incrementArticleView(slug: String!): Boolean!
      deleteArticle(id: ID!): Boolean!
      upsertTopic(id: ID, input: UpsertTopicInput!): Topic!
      deleteTopic(id: ID!): Boolean!
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
    },

    Mutation: {
      upsertArticle: async (_: unknown, { id, input }: any) => {
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

          authorName: data.authorName ?? null,
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

      setArticleStatus: async (_: unknown, { id, status }: any) => {
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
    },
  },
});

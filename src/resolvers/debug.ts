import { GraphQLContext } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const db = prisma as any;

export const debugArticles = async (_: unknown, args: any, context: GraphQLContext) => {
  try {
    console.log('🔍 Debug Articles resolver called');

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
    const userId = context.user.id;

    // Check permissions
    const hasUpdateAnyPermission = PermissionService.hasPermission(
      userRole,
      Permission.UPDATE_ANY_ARTICLE
    );
    const hasReviewPermission = PermissionService.hasPermission(
      userRole,
      Permission.REVIEW_ARTICLES
    );

    // Build where clause like the main articles resolver
    const where: any = {};
    if (!hasUpdateAnyPermission) {
      where.authorId = userId;
    }

    // Get article counts
    const totalArticles = await db.article.count();
    const userArticles = await db.article.count({ where: { authorId: userId } });
    const filteredArticles = await db.article.count({ where });
    const draftArticles = await db.article.count({ where: { status: 'DRAFT' } });
    const reviewArticles = await db.article.count({ where: { status: 'REVIEW' } });
    const publishedArticles = await db.article.count({ where: { status: 'PUBLISHED' } });

    // Get sample articles for debugging
    const sampleArticles = await db.article.findMany({
      where,
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        authorId: true,
        authorName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all users for debugging
    const allUsers = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    return {
      success: true,
      message: 'Article debug info',
      debug: {
        user: {
          id: userId,
          email: context.user.email,
          role: userRole,
        },
        permissions: {
          UPDATE_ANY_ARTICLE: hasUpdateAnyPermission,
          REVIEW_ARTICLES: hasReviewPermission,
        },
        articleCounts: {
          total: totalArticles,
          userOwned: userArticles,
          visibleToUser: filteredArticles,
          byStatus: {
            draft: draftArticles,
            review: reviewArticles,
            published: publishedArticles,
          },
        },
        queryFilter: where,
        sampleArticles: sampleArticles,
        allUsers: allUsers,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('🔍 Debug Articles error:', error);
    return {
      success: false,
      message: 'Debug articles failed',
      debug: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

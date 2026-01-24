// src/services/articleWorkflowService.ts
import { prisma } from '../lib/prisma';
import { UserRole, ArticleStatus } from '@prisma/client';
import { GraphQLContext } from '../middleware/auth';
import { PermissionService, Permission } from './permissionService';
import { AuditService, AuditEventType } from './auditService';
import { z } from 'zod';

/**
 * Workflow action types
 */
export enum WorkflowAction {
  SAVE_DRAFT = 'SAVE_DRAFT',
  SUBMIT_FOR_REVIEW = 'SUBMIT_FOR_REVIEW',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  PUBLISH = 'PUBLISH',
  UNPUBLISH = 'UNPUBLISH',
  ARCHIVE = 'ARCHIVE',
}

/**
 * Workflow transition validation
 */
const VALID_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  [ArticleStatus.DRAFT]: [ArticleStatus.REVIEW, ArticleStatus.ARCHIVED],
  [ArticleStatus.REVIEW]: [ArticleStatus.DRAFT, ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED],
  [ArticleStatus.PUBLISHED]: [ArticleStatus.ARCHIVED],
  [ArticleStatus.ARCHIVED]: [ArticleStatus.DRAFT, ArticleStatus.REVIEW],
};

/**
 * Workflow notification types
 */
export interface WorkflowNotification {
  type: 'SUBMISSION' | 'APPROVAL' | 'REJECTION' | 'PUBLICATION';
  articleId: string;
  articleTitle: string;
  fromUserId: string;
  toUserId?: string;
  message?: string;
  timestamp: Date;
}

/**
 * Article workflow input validation
 */
const WorkflowActionInput = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
  action: z.nativeEnum(WorkflowAction),
  reason: z.string().optional(),
  notifyAuthor: z.boolean().default(true),
});

const BulkWorkflowActionInput = z.object({
  articleIds: z.array(z.string()).min(1, 'At least one article ID is required'),
  action: z.nativeEnum(WorkflowAction),
  reason: z.string().optional(),
  notifyAuthors: z.boolean().default(true),
});

/**
 * Article Workflow Service
 */
export class ArticleWorkflowService {
  /**
   * Perform workflow action on an article
   */
  static async performWorkflowAction(
    context: GraphQLContext,
    input: z.infer<typeof WorkflowActionInput>
  ): Promise<{
    success: boolean;
    message: string;
    article?: any;
    notifications?: WorkflowNotification[];
  }> {
    try {
      const validatedInput = WorkflowActionInput.parse(input);
      const { articleId, action, reason, notifyAuthor } = validatedInput;

      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Get the article
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        include: {
          author: true,
          category: true,
        },
      });

      if (!article) {
        throw new Error('Article not found');
      }

      const userRole = context.user.role as UserRole;
      const isOwner = article.authorId === context.user.id;
      const currentStatus = article.status;

      // Determine target status based on action
      const targetStatus = this.getTargetStatus(action, currentStatus);
      
      // Validate transition
      if (!this.isValidTransition(currentStatus, targetStatus)) {
        throw new Error(`Invalid transition from ${currentStatus} to ${targetStatus}`);
      }

      // Check permissions
      if (!PermissionService.canPerformWorkflowAction(userRole, currentStatus, targetStatus, isOwner)) {
        await AuditService.logPermissionDenied(
          context.user.id,
          `${action} on article ${articleId}`,
          articleId,
          'Article',
          context.request
        );
        throw new Error(`Permission denied: Cannot perform ${action} on article in ${currentStatus} status`);
      }

      // Perform the workflow action
      const updatedArticle = await this.executeWorkflowAction(
        article,
        targetStatus,
        context.user.id,
        reason
      );

      // Log the workflow event
      await AuditService.logWorkflowEvent(
        this.getAuditEventType(action),
        context.user.id,
        articleId,
        currentStatus,
        targetStatus,
        reason,
        context.request
      );

      // Generate notifications
      const notifications = await this.generateNotifications(
        article,
        action,
        context.user.id,
        notifyAuthor,
        reason
      );

      return {
        success: true,
        message: this.getSuccessMessage(action, article.title),
        article: updatedArticle,
        notifications,
      };
    } catch (error) {
      console.error('Workflow action failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Workflow action failed',
      };
    }
  }

  /**
   * Perform bulk workflow actions
   */
  static async performBulkWorkflowAction(
    context: GraphQLContext,
    input: z.infer<typeof BulkWorkflowActionInput>
  ): Promise<{
    success: boolean;
    message: string;
    processedCount: number;
    failedCount: number;
    results: Array<{ articleId: string; success: boolean; message: string }>;
  }> {
    try {
      const validatedInput = BulkWorkflowActionInput.parse(input);
      const { articleIds, action, reason, notifyAuthors } = validatedInput;

      if (!context.user) {
        throw new Error('Authentication required');
      }

      const results: Array<{ articleId: string; success: boolean; message: string }> = [];
      let processedCount = 0;
      let failedCount = 0;

      for (const articleId of articleIds) {
        try {
          const result = await this.performWorkflowAction(context, {
            articleId,
            action,
            reason,
            notifyAuthor: notifyAuthors,
          });

          results.push({
            articleId,
            success: result.success,
            message: result.message,
          });

          if (result.success) {
            processedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          results.push({
            articleId,
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          failedCount++;
        }
      }

      return {
        success: processedCount > 0,
        message: `Processed ${processedCount} articles successfully, ${failedCount} failed`,
        processedCount,
        failedCount,
        results,
      };
    } catch (error) {
      console.error('Bulk workflow action failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Bulk workflow action failed',
        processedCount: 0,
        failedCount: 0,
        results: [],
      };
    }
  }

  /**
   * Get articles pending review for editors
   */
  static async getReviewQueue(
    context: GraphQLContext,
    filters: {
      categoryId?: string;
      authorId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    articles: any[];
    totalCount: number;
    hasMore: boolean;
  }> {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    // Check if user can review articles
    const userRole = context.user.role as UserRole;
    if (!PermissionService.hasPermission(userRole, Permission.REVIEW_ARTICLES)) {
      throw new Error('Permission denied: Cannot access review queue');
    }

    const { categoryId, authorId, limit = 20, offset = 0 } = filters;

    const where: any = {
      status: ArticleStatus.REVIEW,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (authorId) {
      where.authorId = authorId;
    }

    const [articles, totalCount] = await Promise.all([
      prisma.article.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'asc', // Oldest first for review queue
        },
        take: limit,
        skip: offset,
      }),
      prisma.article.count({ where }),
    ]);

    return {
      articles,
      totalCount,
      hasMore: offset + articles.length < totalCount,
    };
  }

  /**
   * Get workflow history for an article
   */
  static async getWorkflowHistory(
    articleId: string,
    context: GraphQLContext
  ): Promise<Array<{
    action: string;
    fromStatus: string;
    toStatus: string;
    performedBy: string;
    performedAt: Date;
    reason?: string;
  }>> {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    // For now, return empty array - would be implemented with audit log database
    // TODO: Query audit logs when database table is created
    console.log(`Getting workflow history for article ${articleId}`);
    return [];
  }

  /**
   * Get workflow statistics
   */
  static async getWorkflowStats(
    context: GraphQLContext,
    timeframe: 'day' | 'week' | 'month' = 'week'
  ): Promise<{
    articlesInReview: number;
    articlesPublishedToday: number;
    articlesRejectedToday: number;
    averageReviewTime: number;
    topAuthors: Array<{ name: string; articlesSubmitted: number }>;
  }> {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const userRole = context.user.role as UserRole;
    if (!PermissionService.hasPermission(userRole, Permission.REVIEW_ARTICLES)) {
      throw new Error('Permission denied: Cannot access workflow statistics');
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [articlesInReview, articlesPublishedToday] = await Promise.all([
      prisma.article.count({
        where: { status: ArticleStatus.REVIEW },
      }),
      prisma.article.count({
        where: {
          status: ArticleStatus.PUBLISHED,
          publishedAt: {
            gte: startOfDay,
          },
        },
      }),
    ]);

    // TODO: Implement more detailed statistics when audit log is available
    return {
      articlesInReview,
      articlesPublishedToday,
      articlesRejectedToday: 0, // Would come from audit logs
      averageReviewTime: 0, // Would be calculated from audit logs
      topAuthors: [], // Would come from aggregated data
    };
  }

  /**
   * Private helper methods
   */
  private static getTargetStatus(action: WorkflowAction, currentStatus: ArticleStatus): ArticleStatus {
    switch (action) {
      case WorkflowAction.SAVE_DRAFT:
        return ArticleStatus.DRAFT;
      case WorkflowAction.SUBMIT_FOR_REVIEW:
        return ArticleStatus.REVIEW;
      case WorkflowAction.APPROVE:
      case WorkflowAction.PUBLISH:
        return ArticleStatus.PUBLISHED;
      case WorkflowAction.REJECT:
        return ArticleStatus.DRAFT;
      case WorkflowAction.UNPUBLISH:
      case WorkflowAction.ARCHIVE:
        return ArticleStatus.ARCHIVED;
      default:
        return currentStatus;
    }
  }

  private static isValidTransition(from: ArticleStatus, to: ArticleStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) || false;
  }

  private static async executeWorkflowAction(
    article: any,
    targetStatus: ArticleStatus,
    userId: string,
    reason?: string
  ): Promise<any> {
    const updateData: any = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    // Set publishedAt when publishing
    if (targetStatus === ArticleStatus.PUBLISHED && !article.publishedAt) {
      updateData.publishedAt = new Date();
    }

    // Clear publishedAt when unpublishing
    if (targetStatus !== ArticleStatus.PUBLISHED && article.publishedAt) {
      updateData.publishedAt = null;
    }

    return await prisma.article.update({
      where: { id: article.id },
      data: updateData,
      include: {
        author: true,
        category: true,
      },
    });
  }

  private static getAuditEventType(action: WorkflowAction): AuditEventType {
    switch (action) {
      case WorkflowAction.SUBMIT_FOR_REVIEW:
        return AuditEventType.ARTICLE_SUBMITTED_FOR_REVIEW;
      case WorkflowAction.APPROVE:
        return AuditEventType.ARTICLE_APPROVED;
      case WorkflowAction.REJECT:
        return AuditEventType.ARTICLE_REJECTED;
      case WorkflowAction.PUBLISH:
        return AuditEventType.ARTICLE_PUBLISHED;
      case WorkflowAction.UNPUBLISH:
      case WorkflowAction.ARCHIVE:
        return AuditEventType.ARTICLE_UNPUBLISHED;
      default:
        return AuditEventType.ARTICLE_STATUS_CHANGED;
    }
  }

  private static async generateNotifications(
    article: any,
    action: WorkflowAction,
    performedByUserId: string,
    notifyAuthor: boolean,
    reason?: string
  ): Promise<WorkflowNotification[]> {
    const notifications: WorkflowNotification[] = [];

    if (!notifyAuthor || !article.authorId || article.authorId === performedByUserId) {
      return notifications;
    }

    const notificationType = this.getNotificationType(action);
    if (!notificationType) return notifications;

    notifications.push({
      type: notificationType,
      articleId: article.id,
      articleTitle: article.title,
      fromUserId: performedByUserId,
      toUserId: article.authorId,
      message: reason,
      timestamp: new Date(),
    });

    // TODO: Send actual notifications (email, in-app, etc.)
    console.log('Generated workflow notification:', notifications[0]);

    return notifications;
  }

  private static getNotificationType(action: WorkflowAction): WorkflowNotification['type'] | null {
    switch (action) {
      case WorkflowAction.SUBMIT_FOR_REVIEW:
        return 'SUBMISSION';
      case WorkflowAction.APPROVE:
        return 'APPROVAL';
      case WorkflowAction.REJECT:
        return 'REJECTION';
      case WorkflowAction.PUBLISH:
        return 'PUBLICATION';
      default:
        return null;
    }
  }

  private static getSuccessMessage(action: WorkflowAction, articleTitle: string): string {
    switch (action) {
      case WorkflowAction.SAVE_DRAFT:
        return `Article "${articleTitle}" saved as draft`;
      case WorkflowAction.SUBMIT_FOR_REVIEW:
        return `Article "${articleTitle}" submitted for review`;
      case WorkflowAction.APPROVE:
        return `Article "${articleTitle}" approved`;
      case WorkflowAction.REJECT:
        return `Article "${articleTitle}" rejected`;
      case WorkflowAction.PUBLISH:
        return `Article "${articleTitle}" published`;
      case WorkflowAction.UNPUBLISH:
        return `Article "${articleTitle}" unpublished`;
      case WorkflowAction.ARCHIVE:
        return `Article "${articleTitle}" archived`;
      default:
        return `Article "${articleTitle}" updated`;
    }
  }
}

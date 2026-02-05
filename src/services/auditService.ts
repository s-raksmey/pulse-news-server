// src/services/auditService.ts
import { prisma } from '../lib/prisma';
import { GraphQLContext } from '../middleware/auth';

/**
 * Audit event types for tracking system activities
 */
export enum AuditEventType {
  // Authentication Events
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTRATION = 'USER_REGISTRATION',

  // User Management Events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Article Events
  ARTICLE_CREATED = 'ARTICLE_CREATED',
  ARTICLE_UPDATED = 'ARTICLE_UPDATED',
  ARTICLE_DELETED = 'ARTICLE_DELETED',
  ARTICLE_STATUS_CHANGED = 'ARTICLE_STATUS_CHANGED',
  ARTICLE_PUBLISHED = 'ARTICLE_PUBLISHED',
  ARTICLE_UNPUBLISHED = 'ARTICLE_UNPUBLISHED',

  // Article Feature Events
  ARTICLE_FEATURED = 'ARTICLE_FEATURED',
  ARTICLE_UNFEATURED = 'ARTICLE_UNFEATURED',
  ARTICLE_BREAKING_SET = 'ARTICLE_BREAKING_SET',
  ARTICLE_BREAKING_UNSET = 'ARTICLE_BREAKING_UNSET',
  ARTICLE_EDITORS_PICK_SET = 'ARTICLE_EDITORS_PICK_SET',
  ARTICLE_EDITORS_PICK_UNSET = 'ARTICLE_EDITORS_PICK_UNSET',

  // Content Review Events
  ARTICLE_SUBMITTED_FOR_REVIEW = 'ARTICLE_SUBMITTED_FOR_REVIEW',
  ARTICLE_APPROVED = 'ARTICLE_APPROVED',
  ARTICLE_REJECTED = 'ARTICLE_REJECTED',

  // Category Events
  CATEGORY_CREATED = 'CATEGORY_CREATED',
  CATEGORY_UPDATED = 'CATEGORY_UPDATED',
  CATEGORY_DELETED = 'CATEGORY_DELETED',

  // Settings Events
  SETTING_UPDATED = 'SETTING_UPDATED',
  SETTINGS_BULK_UPDATED = 'SETTINGS_BULK_UPDATED',

  // Security Events
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  id?: string;
  eventType: AuditEventType;
  userId?: string;
  targetUserId?: string;
  resourceId?: string;
  resourceType?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  success: boolean;
  errorMessage?: string;
}

/**
 * Audit Service for logging and retrieving audit events
 */
export class AuditService {
  /**
   * Log an audit event
   */
  static async logEvent(entry: AuditLogEntry): Promise<void> {
    try {
      // Store in database
      await prisma.auditLog.create({
        data: {
          eventType: entry.eventType,
          userId: entry.userId,
          targetUserId: entry.targetUserId,
          resourceId: entry.resourceId,
          resourceType: entry.resourceType,
          details: entry.details || null,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          success: entry.success,
          errorMessage: entry.errorMessage,
        },
      });
    } catch (error) {
      // Don't throw error to avoid breaking the main operation
      // Log to console for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to log audit event:', error);
      }
    }
  }

  /**
   * Log authentication event
   */
  static async logAuthEvent(
    eventType: AuditEventType,
    userId: string,
    success: boolean,
    details?: any,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      success,
      details,
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log user management event
   */
  static async logUserEvent(
    eventType: AuditEventType,
    performedBy: string,
    targetUserId: string,
    details?: any,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId: performedBy,
      targetUserId,
      success: true,
      details,
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log article event
   */
  static async logArticleEvent(
    eventType: AuditEventType,
    userId: string,
    articleId: string,
    details?: any,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      resourceId: articleId,
      resourceType: 'Article',
      success: true,
      details,
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log permission denied event
   */
  static async logPermissionDenied(
    userId: string,
    attemptedAction: string,
    resourceId?: string,
    resourceType?: string,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType: AuditEventType.PERMISSION_DENIED,
      userId,
      resourceId,
      resourceType,
      success: false,
      details: {
        attemptedAction,
        reason: 'Insufficient permissions',
      },
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log workflow event
   */
  static async logWorkflowEvent(
    eventType: AuditEventType,
    userId: string,
    articleId: string,
    fromStatus: string,
    toStatus: string,
    reason?: string,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      resourceId: articleId,
      resourceType: 'Article',
      success: true,
      details: {
        fromStatus,
        toStatus,
        reason,
      },
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log category event
   */
  static async logCategoryEvent(
    eventType: AuditEventType,
    userId: string,
    categoryId: string,
    details?: any,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      resourceId: categoryId,
      resourceType: 'Category',
      success: true,
      details,
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log settings event
   */
  static async logSettingsEvent(
    eventType: AuditEventType,
    userId: string,
    settingKey: string,
    oldValue?: any,
    newValue?: any,
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      resourceId: settingKey,
      resourceType: 'Setting',
      success: true,
      details: {
        settingKey,
        oldValue,
        newValue,
      },
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log data change event with before/after comparison
   */
  static async logDataChange(
    eventType: AuditEventType,
    userId: string,
    resourceId: string,
    resourceType: string,
    beforeData?: Record<string, any>,
    afterData?: Record<string, any>,
    request?: Request
  ): Promise<void> {
    // Calculate what changed
    const changes: Record<string, { before: any; after: any }> = {};

    if (beforeData && afterData) {
      const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);

      allKeys.forEach((key) => {
        const before = beforeData[key];
        const after = afterData[key];

        if (JSON.stringify(before) !== JSON.stringify(after)) {
          changes[key] = { before, after };
        }
      });
    }

    await this.logEvent({
      eventType,
      userId,
      resourceId,
      resourceType,
      success: true,
      details: {
        changes: Object.keys(changes).length > 0 ? changes : null,
        changedFields: Object.keys(changes),
        timestamp: new Date().toISOString(),
      },
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Log bulk operation
   */
  static async logBulkOperation(
    eventType: AuditEventType,
    userId: string,
    resourceType: string,
    details: {
      resourceIds: string[];
      action: string;
      results?: {
        success: number;
        failed: number;
        errors?: string[];
      };
      metadata?: any;
    },
    request?: Request
  ): Promise<void> {
    await this.logEvent({
      eventType,
      userId,
      resourceType,
      success: details.results?.failed === 0 || !details.results,
      details: {
        ...details,
        operationTime: new Date().toISOString(),
        itemCount: details.resourceIds.length,
      },
      ipAddress: this.extractIpAddress(request),
      userAgent: request?.headers.get('user-agent') || undefined,
    });
  }

  /**
   * Create audit context from GraphQL context
   */
  static createAuditContext(context: GraphQLContext): {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  } {
    return {
      userId: context.user?.id,
      ipAddress: this.extractIpAddress(context.request),
      userAgent: context.request?.headers.get('user-agent') || undefined,
    };
  }

  /**
   * Extract IP address from request
   */
  private static extractIpAddress(request?: Request): string | undefined {
    if (!request) return undefined;

    // Check various headers for IP address
    const headers = ['x-forwarded-for', 'x-real-ip', 'x-client-ip', 'cf-connecting-ip'];

    for (const header of headers) {
      const value = request.headers.get(header);
      if (value) {
        // Take the first IP if there are multiple
        return value.split(',')[0].trim();
      }
    }

    return undefined;
  }

  /**
   * Public method to get client IP from request
   * Used by resolvers to capture IP address during auth operations
   */
  static getClientIp(request?: Request): string | undefined {
    return this.extractIpAddress(request);
  }

  /**
   * Get audit logs
   */
  static async getAuditLogs(filters: {
    userId?: string;
    eventType?: AuditEventType;
    resourceId?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.resourceType) where.resourceType = filters.resourceType;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    });

    return logs.map((log) => ({
      id: log.id,
      eventType: log.eventType as AuditEventType,
      userId: log.userId || undefined,
      targetUserId: log.targetUserId || undefined,
      resourceId: log.resourceId || undefined,
      resourceType: log.resourceType || undefined,
      details: log.details as any,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      timestamp: log.createdAt,
      success: log.success,
      errorMessage: log.errorMessage || undefined,
    }));
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    securityEvents: number;
    userActivity: number;
  }> {
    const now = new Date();
    const startDate = new Date();

    switch (timeframe) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    // Get total events
    const totalEvents = await prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
      },
    });

    // Get events by type
    const eventTypeGroups = await prisma.auditLog.groupBy({
      by: ['eventType'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const eventsByType: Record<string, number> = {};
    eventTypeGroups.forEach((group) => {
      eventsByType[group.eventType] = group._count;
    });

    // Count security events
    const securityEventTypes = [
      AuditEventType.PERMISSION_DENIED,
      AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
      AuditEventType.SUSPICIOUS_ACTIVITY,
    ];

    const securityEvents = await prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        eventType: { in: securityEventTypes },
      },
    });

    // Count user activity events (logins, etc.)
    const userActivityTypes = [
      AuditEventType.USER_LOGIN,
      AuditEventType.USER_LOGOUT,
      AuditEventType.USER_REGISTRATION,
    ];

    const userActivity = await prisma.auditLog.count({
      where: {
        createdAt: { gte: startDate },
        eventType: { in: userActivityTypes },
      },
    });

    return {
      totalEvents,
      eventsByType,
      securityEvents,
      userActivity,
    };
  }
}

/**
 * Audit decorator for automatic logging of resolver actions
 */
export function auditLog(eventType: AuditEventType, resourceType?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const resolverArgs = args[0];
      const context = args[1] as GraphQLContext;
      const auditContext = AuditService.createAuditContext(context);

      try {
        const result = await method.apply(this, args);

        // Log successful operation
        await AuditService.logEvent({
          eventType,
          userId: auditContext.userId,
          resourceId: resolverArgs.id || resolverArgs.input?.id,
          resourceType,
          success: true,
          details: {
            operation: propertyName,
            input: resolverArgs.input || resolverArgs,
          },
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        });

        return result;
      } catch (error) {
        // Log failed operation
        await AuditService.logEvent({
          eventType,
          userId: auditContext.userId,
          resourceId: resolverArgs.id || resolverArgs.input?.id,
          resourceType,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          details: {
            operation: propertyName,
            input: resolverArgs.input || resolverArgs,
          },
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        });

        throw error;
      }
    };
  };
}

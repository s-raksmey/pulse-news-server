// src/services/notificationService.ts
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { EmailService } from './emailService';

type NotificationCreateArgs = {
  data: {
    type: NotificationTypeValue;
    title: string;
    message?: string;
    metadata?: Prisma.JsonValue;
    articleId?: string;
    fromUserId?: string;
    toUserId: string;
  };
};

type NotificationClient = {
  notification: {
    create: (args: NotificationCreateArgs) => Promise<NotificationRecord>;
  };
};

type NotificationTypeValue =
  | 'SUBMISSION'
  | 'APPROVAL'
  | 'REJECTION'
  | 'PUBLICATION'
  | 'UNPUBLICATION'
  | 'ARCHIVE'
  | 'DRAFT_SAVED'
  | 'REVISION_REQUESTED'
  | 'REVISION_APPROVED'
  | 'REVISION_REJECTED'
  | 'REVISION_CONSUMED'
  | 'USER_REGISTRATION_REQUEST'
  | 'ACCOUNT_REQUEST';

type NotificationRecord = {
  id: string;
  type: NotificationTypeValue;
  title: string;
  message?: string | null;
  metadata?: Prisma.JsonValue | null;
  articleId?: string | null;
  fromUserId?: string | null;
  toUserId: string;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationDispatch = {
  type: NotificationTypeValue;
  title: string;
  message?: string;
  metadata?: Prisma.JsonValue;
  articleId?: string;
  fromUserId?: string;
  toUserId: string;
  toUserEmail?: string | null;
  toUserName?: string | null;
};

export class NotificationService {
  static async createAndDispatch(
    notifications: NotificationDispatch[]
  ): Promise<NotificationRecord[]> {
    if (notifications.length === 0) return [];

    const created = await prisma.$transaction(async (tx) => {
      const txDb = tx as unknown as NotificationClient;

      return Promise.all(
        notifications.map((notification) =>
          txDb.notification.create({
            data: {
              type: notification.type,
              title: notification.title,
              message: notification.message,
              metadata: notification.metadata ?? undefined,
              articleId: notification.articleId,
              ...(notification.fromUserId ? { fromUserId: notification.fromUserId } : {}),
              toUserId: notification.toUserId,
            },
          })
        )
      );
    });

    await this.sendEmailsIfEnabled(notifications);

    return created;
  }

  private static async sendEmailsIfEnabled(notifications: NotificationDispatch[]): Promise<void> {
    try {
      const config = await EmailService.getEmailConfig();
      if (!config) {
        console.log('Email notifications disabled: No email configuration found');
        return;
      }

      const fromUserIds = Array.from(
        new Set(notifications.map((notification) => notification.fromUserId).filter(Boolean))
      ) as string[];

      const fromUsers = fromUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: fromUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

      const fromUserMap = new Map(fromUsers.map((user) => [user.id, user]));

      // Process emails sequentially to avoid overwhelming the SMTP server
      // and to ensure individual failures don't block other notifications
      for (const notification of notifications) {
        try {
          const toEmail = notification.toUserEmail;
          if (!toEmail) {
            console.log(`Skipping notification for user ${notification.toUserId}: No email address`);
            continue;
          }

          const fromUser = notification.fromUserId
            ? fromUserMap.get(notification.fromUserId)
            : undefined;

          const lines = [notification.title];

          if (notification.message) {
            lines.push('', `Reason: ${notification.message}`);
          }

          if (notification.metadata && typeof notification.metadata === 'object') {
            const metadata = notification.metadata as Record<string, unknown>;
            const articleTitle = metadata.articleTitle;
            if (typeof articleTitle === 'string') {
              lines.push('', `Article: ${articleTitle}`);
            }
          }

          if (fromUser?.name) {
            lines.push('', `From: ${fromUser.name}`);
          }

          const text = lines.join('\n');
          const html = lines
            .map((line) => (line ? `<p>${line}</p>` : '<br />'))
            .join('');

          await EmailService.sendNotificationEmail({
            to: toEmail,
            subject: notification.title,
            text,
            html,
          });
        } catch (emailError) {
          // Log individual email failures but continue processing other notifications
          console.error(`Failed to send email notification to ${notification.toUserEmail}:`, {
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
            notificationType: notification.type,
            title: notification.title
          });
        }
      }
    } catch (error) {
      // Log the error but don't throw it - email failures shouldn't break the notification system
      console.error('Failed to process email notifications:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        notificationCount: notifications.length,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }
}

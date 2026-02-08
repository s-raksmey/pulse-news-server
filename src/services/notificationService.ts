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
  | 'REVISION_CONSUMED';

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
              fromUserId: notification.fromUserId,
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
    const config = await EmailService.getEmailConfig();
    if (!config) return;

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

    await Promise.all(
      notifications.map(async (notification) => {
        const toEmail = notification.toUserEmail;
        if (!toEmail) return;

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
      })
    );
  }
}

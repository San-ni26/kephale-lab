import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ExpoPushService } from './expo-push.service';

type NotificationType = 'NEW_TRACK' | 'NEW_ALBUM' | 'NEW_VIDEO';

// Regex Expo Push Token valide
const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[.+\]$|^[a-zA-Z0-9_-]{20,}$/;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly expoPushService: ExpoPushService,
  ) {}

  private publishUserUpdate(userId: string, data: any) {
    const channel = `user:${userId}:updates`;
    this.redis.publish(channel, JSON.stringify(data)).catch(() => {});
  }

  /**
   * Enregistre le token Expo Push de l'utilisateur en base de données.
   * Appelé depuis le mobile après accord des permissions de notification.
   * Requis pour recevoir des notifications push en production.
   */
  async registerPushToken(userId: string, token: string): Promise<{ registered: boolean }> {
    if (!token || !EXPO_PUSH_TOKEN_REGEX.test(token)) {
      throw new BadRequestException('Token Expo Push invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    });

    return { registered: true };
  }

  /**
   * Supprime le token Expo Push (logout ou désactivation des notifications)
   */
  async unregisterPushToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null },
    });
  }

  async getMyNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return null;
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return null;
  }

  async notifyFollowers(artistId: string, type: NotificationType, payload: { title: string; body: string; data?: any }) {
    const prefField =
      type === 'NEW_TRACK' ? 'notifyTracks'
      : type === 'NEW_ALBUM' ? 'notifyAlbums'
      : 'notifyVideos';

    const artist = await this.prisma.artistProfile.findUnique({
      where: { id: artistId },
      select: { userId: true },
    });

    if (!artist) return;

    const followers = await this.prisma.follow.findMany({
      where: {
        artistId,
        userId: { not: artist.userId },
        OR: [{ [prefField]: true }, { notifyAll: true }],
      },
      select: { userId: true },
    });

    if (followers.length === 0) return;

    const notifications = followers.map((f) => ({
      userId: f.userId,
      type,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }));

    await this.prisma.notification.createMany({
      data: notifications,
    });

    followers.forEach((f) => {
      this.publishUserUpdate(f.userId, {
        type,
        title: payload.title,
        message: payload.body,
        data: payload.data || {},
      });
    });

    // Envoi des notifications push natives
    this.expoPushService
      .sendToUsers(
        followers.map((f) => f.userId),
        {
          title: payload.title,
          body: payload.body,
          data: { type, ...(payload.data || {}) },
        },
      )
      .catch(() => {});
  }

  async sendNotification(userId: string, title: string, body: string, type: string, data: any = {}) {
    await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data,
      },
    });

    this.publishUserUpdate(userId, {
      type: 'NOTIFICATION',
      data: { title, body, type },
    });

    // Envoi de la notification push native
    this.expoPushService
      .sendToUser(userId, {
        title,
        body,
        data: { type, ...(data || {}) },
      })
      .catch(() => {});
  }
}

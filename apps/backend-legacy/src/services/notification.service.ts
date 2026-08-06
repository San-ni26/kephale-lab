import { prisma } from '@kephale/database';
import { publishUserUpdate } from '../lib/redisPubSub.js';

type NotificationType = 'NEW_TRACK' | 'NEW_ALBUM' | 'NEW_VIDEO';

export const NotificationService = {
  async notifyFollowers(artistId: string, type: NotificationType, payload: { title: string; body: string; data?: any }) {
    // Determine which preference flag to check
    const prefField = type === 'NEW_TRACK' ? 'notifyTracks' :
                      type === 'NEW_ALBUM' ? 'notifyAlbums' : 'notifyVideos';

    // Get artist's userId to exclude them from notifications
    const artist = await prisma.artistProfile.findUnique({
      where: { id: artistId },
      select: { userId: true }
    });

    if (!artist) return;

    // Find followers who have this preference true, OR notifyAll true (excluding the artist)
    const followers = await prisma.follow.findMany({
      where: {
        artistId,
        userId: { not: artist.userId },
        OR: [
          { [prefField]: true },
          { notifyAll: true }
        ]
      },
      select: { userId: true }
    });

    if (followers.length === 0) return;

    // Create Notification records in DB
    const notifications = followers.map(f => ({
      userId: f.userId,
      type,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }));

    await prisma.notification.createMany({
      data: notifications,
    });

    // Send real-time Redis events
    followers.forEach(f => {
      publishUserUpdate(f.userId, {
        type,
        title: payload.title,
        message: payload.body, // message format expected by mobile
        data: payload.data || {}
      });
    });
  },

  async sendNotification(userId: string, title: string, body: string, type: string, data: any = {}) {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data
      }
    });

    publishUserUpdate(userId, {
      type: 'NOTIFICATION',
      data: { title, body, type }
    });
  }
};

import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const ACCESS_CACHE_TTL = 60; // 60s — révocation d'accès prise en compte rapidement


@Injectable()
export class AccessControlService {
  private readonly QUOTAS = {
    PREMIUM: 50,
    PREMIUM_PLUS: 500,
  };

  constructor(
    private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private async checkAndConsumeSubscriptionQuota(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub || sub.status !== 'ACTIVE') return false;

    const now = new Date();
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
      return false;
    }

    const quota = this.QUOTAS[sub.tier as keyof typeof this.QUOTAS];
    if (!quota) return false;

    if (sub.paidStreamsUsed < quota) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { paidStreamsUsed: { increment: 1 } },
      });
      return true;
    }

    return false;
  }

  async canAccessTrack(userId: string, track: any): Promise<boolean> {
    if (!track.price || track.price <= 0) return true;

    const cacheKey = `access:track:${userId}:${track.id}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    const orConditions: any[] = [{ userId, trackId: track.id, status: 'SUCCEEDED' }];
    if (track.albumId) {
      orConditions.push({ userId, albumId: track.albumId, status: 'SUCCEEDED' });
    }

    const purchase = await this.prisma.purchase.findFirst({
      where: { OR: orConditions },
    });

    if (purchase) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === track.artistId) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const hasAccess = await this.checkAndConsumeSubscriptionQuota(userId);

    try {
      await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  async canAccessVideo(userId: string, video: any): Promise<boolean> {
    if (!video.price || video.price <= 0) return true;

    const cacheKey = `access:video:${userId}:${video.id}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    const purchase = await this.prisma.purchase.findFirst({
      where: { userId, videoId: video.id, status: 'SUCCEEDED' },
    });

    if (purchase) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === video.artistId) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const hasAccess = await this.checkAndConsumeSubscriptionQuota(userId);

    try {
      await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  async canAccessAlbum(userId: string, album: any): Promise<boolean> {
    if (!album.price || album.price <= 0) return true;

    const cacheKey = `access:album:${userId}:${album.id}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    const purchase = await this.prisma.purchase.findFirst({
      where: { userId, albumId: album.id, status: 'SUCCEEDED' },
    });

    if (purchase) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === album.artistId) {
      try { await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    let hasAccess = false;
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    const now = new Date();
    if (
      sub &&
      sub.status === 'ACTIVE' &&
      (sub.tier === 'PREMIUM' || sub.tier === 'PREMIUM_PLUS') &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd >= now)
    ) {
      const quota = this.QUOTAS[sub.tier as keyof typeof this.QUOTAS];
      if (quota && sub.paidStreamsUsed < quota) {
        hasAccess = true;
      }
    }

    try {
      await this.redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  async invalidateUserAccessCache(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`access:*:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch {}
  }
}

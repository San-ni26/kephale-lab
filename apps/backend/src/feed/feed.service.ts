import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheService } from '../redis/cache.service';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  async getFeed(userId: string) {
    const cacheKey = `feed:user:${userId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const follows = await this.prisma.follow.findMany({
          where: { userId },
          select: { artistId: true },
        });

        const artistIds = follows.map((f) => f.artistId);

        const posts = await this.prisma.post.findMany({
          where: { artistId: { in: artistIds } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
            track: { select: { id: true, title: true, coverUrl: true, duration: true, price: true } },
            video: { select: { id: true, title: true, thumbnailUrl: true, duration: true, type: true } },
            _count: { select: { likes: true, comments: true } },
          },
        });

        return posts;
      },
      60 // 60 seconds TTL
    );
  }
}


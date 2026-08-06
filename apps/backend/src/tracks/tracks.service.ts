import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AccessControlService } from '../subscriptions/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../redis/cache.service';

@Injectable()
export class TracksService {
  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue('media-processing') private readonly mediaQueue: Queue,
    private readonly accessControlService: AccessControlService,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
  ) {}

  async createTrack(userId: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    if (data.albumId) {
      const album = await this.prisma.album.findUnique({ where: { id: data.albumId } });
      if (!album || album.artistId !== artist.id) {
        throw new BadRequestException({ success: false, error: { code: 'INVALID_ALBUM', message: 'Album not found or not yours' } });
      }
    }

    const track = await this.prisma.track.create({
      data: {
        title: data.title,
        audioUrl: data.audioUrl,
        s3Key: data.s3Key,
        fingerprint: null,
        duration: data.duration,
        coverUrl: data.coverUrl || artist.coverImage || artist.avatar || '',
        price: data.price,
        currency: data.currency,
        genre: data.genre,
        albumId: data.albumId,
        isExplicit: data.isExplicit,
        bpm: data.bpm,
        key: data.key,
        artistId: artist.id,
        status: 'ACTIVE',
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      },
    });

    await this.mediaQueue.add('transcode-audio', {
      type: 'TRANSCODE_AUDIO',
      payload: { trackId: track.id },
    });

    await this.mediaQueue.add('generate-track-fingerprint', {
      type: 'GENERATE_TRACK_FINGERPRINT',
      payload: { trackId: track.id },
    }, { delay: 10000 });

    // Invalidate list caches
    await this.cacheService.delByPattern('tracks:*');

    const genreText = track.genre && track.genre.length > 0 ? ` (${track.genre[0]})` : '';
    this.notificationsService.notifyFollowers(artist.id, 'NEW_TRACK', {
      title: 'Nouveau Son',
      body: `${artist.stageName} a publié une nouvelle musique${genreText} : "${track.title}"`,
      data: { trackId: track.id }
    }).catch(console.error);

    return track;
  }

  async getTracks(query: any) {
    const { page = 1, limit = 20, genre, artistId, albumId, isSingle, search, sort = 'newest' } = query;
    const skip = (page - 1) * limit;

    const where: any = { status: 'ACTIVE' };
    if (genre) where.genre = { has: genre };
    if (artistId) where.artistId = artistId;
    if (albumId) where.albumId = albumId;
    if (isSingle) where.albumId = null;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: any =
      sort === 'popular' ? { plays: 'desc' }
      : sort === 'price_asc' ? { price: 'asc' }
      : sort === 'price_desc' ? { price: 'desc' }
      : { createdAt: 'desc' };

    const [total, tracks] = await Promise.all([
      this.prisma.track.count({ where }),
      this.prisma.track.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          artist: {
            select: { id: true, stageName: true, avatar: true, isVerified: true },
          },
          album: { select: { id: true, title: true } },
          _count: { select: { likes: true, purchases: true } },
        },
      }),
    ]);

    return {
      data: tracks,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getMyTracks(userId: string, query: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });
    }

    const { page = 1, limit = 30, status } = query;
    const skip = (page - 1) * limit;
    const where: any = { artistId: artist.id };
    if (status) where.status = status;

    const [total, tracks] = await Promise.all([
      this.prisma.track.count({ where }),
      this.prisma.track.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          album: { select: { id: true, title: true } },
          _count: { select: { likes: true, purchases: true } },
        },
      }),
    ]);

    return {
      data: tracks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }

  async getTrackById(id: string) {
    const cacheKey = `track:details:${id}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const track = await this.prisma.track.findUnique({
          where: { id },
          include: {
            artist: {
              select: { id: true, stageName: true, avatar: true, coverImage: true, isVerified: true },
            },
            album: { select: { id: true, title: true, coverUrl: true } },
            _count: { select: { likes: true, purchases: true } },
          },
        });

        if (!track || track.status !== 'ACTIVE') {
          throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
        }

        return track;
      },
      120 // 2 minutes TTL
    );
  }

  async updateTrack(userId: string, id: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const track = await this.prisma.track.findUnique({ where: { id } });

    if (!track || !artist || track.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your track' } });
    }

    const updated = await this.prisma.track.update({
      where: { id },
      data: {
        ...data,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      },
    });

    // Invalidate caches
    await this.cacheService.del(`track:details:${id}`);
    await this.cacheService.delByPattern('tracks:*');

    return updated;
  }

  async deleteTrack(userId: string, id: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const track = await this.prisma.track.findUnique({ where: { id } });

    if (!track || !artist || track.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your track' } });
    }

    await this.prisma.track.update({ where: { id }, data: { status: 'INACTIVE' } });

    // Invalidate caches
    await this.cacheService.del(`track:details:${id}`);
    await this.cacheService.delByPattern('tracks:*');
  }

  async streamTrack(userId: string, id: string) {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track || track.status !== 'ACTIVE') {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
    }

    const hasAccess = await this.accessControlService.canAccessTrack(userId, track);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to stream this track' },
      });
    }

    this.prisma.track.updateMany({ where: { id }, data: { plays: { increment: 1 } } }).catch(() => {});

    return {
      streamUrl: track.audioUrl,
      duration: track.duration,
    };
  }

  async reportPlay(id: string) {
    try {
      await this.prisma.track.updateMany({ where: { id }, data: { plays: { increment: 1 } } });
    } catch {}
  }

  async toggleLike(userId: string, id: string) {
    const track = await this.prisma.track.findUnique({ where: { id }, select: { artistId: true } });
    if (!track) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
    }

    try {
      await this.prisma.like.create({ data: { userId, trackId: id } });
      
      if (track.artistId) {
        const artist = await this.prisma.artistProfile.findUnique({ where: { id: track.artistId } });
        if (artist) {
          // Fire and forget via notifications service (which publishes updates)
          this.notificationsService.sendNotification(artist.userId, 'NEW_LIKE', `Nouveau like sur une track`, 'NEW_LIKE', {
            trackId: id,
            userId,
          }).catch(() => {});
        }
      }

      return { liked: true };
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existing = await this.prisma.like.findUnique({
          where: { userId_trackId: { userId, trackId: id } },
        });
        if (existing) {
          await this.prisma.like.delete({ where: { id: existing.id } });
          return { liked: false };
        }
      }
      throw err;
    }
  }
}

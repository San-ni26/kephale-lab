import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccessControlService } from '../subscriptions/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AudioFingerprintService } from '../audio-fingerprint/audio-fingerprint.service';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accessControlService: AccessControlService,
    private readonly notificationsService: NotificationsService,
    private readonly audioFingerprintService: AudioFingerprintService,
    @InjectQueue('media-processing') private readonly mediaQueue: Queue,
  ) {}

  async getVideos(userId: string | null, query: any, ip: string, sessionHeader?: string) {
    const { page = 1, limit = 20, type, artistId, search, sort = 'newest', refresh } = query;
    const skip = (page - 1) * limit;
    const where: any = { status: 'ACTIVE' };
    if (type) where.type = type;
    if (artistId) where.artistId = artistId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const actualOrderBy = sort === 'popular' ? { views: 'desc' as const } : { createdAt: 'desc' as const };
    const [total, videos] = await Promise.all([
      this.prisma.video.count({ where }),
      this.prisma.video.findMany({
        where,
        orderBy: actualOrderBy,
        skip,
        take: limit,
        include: {
          artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
          user: { select: { id: true, name: true, avatar: true } },
          _count: { select: { likes: true, comments: true } },
          likes: userId ? { where: { userId } } : false,
        },
      }),
    ]);
    
    const formattedVideos = videos.map((v: any) => ({
      ...v,
      artist: v.artist || { id: v.user?.id, stageName: v.user?.name, avatar: v.user?.avatar, isVerified: false },
      hasLiked: v.likes ? v.likes.length > 0 : false,
      likes: undefined
    }));

    return {
      data: formattedVideos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }

  async getMyVideos(userId: string, query: any) {
    const { page = 1, limit = 30, type } = query;
    const skip = (page - 1) * limit;
    
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const where: any = { status: { not: 'INACTIVE' } };
    if (artist) {
      where.artistId = artist.id;
    } else {
      where.userId = userId;
    }
    if (type) where.type = type;

    const [total, videos] = await Promise.all([
      this.prisma.video.count({ where }),
      this.prisma.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { likes: true, comments: true } } },
      }),
    ]);

    return {
      data: videos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }

  async verifyAudioRights(userId: string, body: any) {
    return this.audioFingerprintService.analyzeAndDetectCopyright({
      userId,
      trackId: body.trackId,
      audioTitle: body.audioTitle,
      videoS3Key: body.videoS3Key,
      videoUrl: body.videoUrl,
      originalAudioName: body.originalAudioName,
      title: body.title,
      description: body.description,
    });
  }

  async createVideo(userId: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    
    if (data.type === 'CLIP' && !artist) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Only artists can publish clips' } });
    }

    const rightsCheck = await this.audioFingerprintService.analyzeAndDetectCopyright({
      userId,
      trackId: data.audioTrackId,
      originalAudioName: data.originalAudioName,
      videoS3Key: data.s3Key,
      videoUrl: data.videoUrl,
      title: data.title,
      description: data.description,
    });

    if (!rightsCheck.isAuthorized) {
      throw new HttpException({
        success: false,
        error: {
          code: 'PAYMENT_REQUIRED',
          message: rightsCheck.message,
          tokensRequired: rightsCheck.tokensRequired,
          matchedTrack: rightsCheck.matchedTrack,
        },
      }, 402);
    }

    const artistId = artist ? artist.id : null;
    const ownerUserId = !artist ? userId : null;

    const video = await this.prisma.video.create({
      data: {
        artistId,
        userId: ownerUserId,
        title: data.title,
        description: data.description,
        type: data.type,
        videoUrl: data.videoUrl,
        s3Key: data.s3Key,
        thumbnailUrl: data.thumbnailUrl || '',
        duration: data.duration,
        price: data.price,
        currency: data.currency,
        isExplicit: data.isExplicit,
        audioTrackId: data.audioTrackId || null,
        originalAudioName: data.originalAudioName || null,
        trimStart: data.trimStart ?? 0,
        trimEnd: data.trimEnd || null,
        audioVolume: data.audioVolume ?? 1.0,
        videoVolume: data.videoVolume ?? 1.0,
        status: 'ACTIVE', 
      },
    });

    await this.mediaQueue.add('transcode-video', { type: 'TRANSCODE_VIDEO', payload: { videoId: video.id } });
    
    await this.mediaQueue.add('verify-video-audio', {
      type: 'VERIFY_VIDEO_AUDIO',
      payload: { videoId: video.id },
    }, { delay: 5000 });

    if (artistId) {
      const videoTypeStr = video.type === 'CLIP' ? 'un nouveau clip' : 'un nouveau reel';
      this.notificationsService.notifyFollowers(artistId, 'NEW_VIDEO', {
        title: video.type === 'CLIP' ? 'Nouveau Clip' : 'Nouveau Reel',
        body: `${artist!.stageName} a publié ${videoTypeStr} : "${video.title}"`,
        data: { videoId: video.id }
      }).catch(console.error);
    }

    return video;
  }

  async getVideoById(userId: string | null, id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, isVerified: true, totalFollowers: true } },
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    if (!video || video.status !== 'ACTIVE') {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    let hasWatched = false;
    if (userId) {
      const view = await this.prisma.userVideoView.findUnique({
        where: { userId_videoId: { userId, videoId: id } }
      });
      hasWatched = !!view;
    }

    return {
      ...video,
      artist: video.artist || { id: (video as any).user?.id, stageName: (video as any).user?.name, avatar: (video as any).user?.avatar, isVerified: false },
      hasWatched
    };
  }

  async updateVideo(userId: string, id: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const video = await this.prisma.video.findUnique({ where: { id } });

    const isOwner = video && ((artist && video.artistId === artist.id) || (video.userId === userId));
    if (!isOwner) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your video' } });

    return this.prisma.video.update({
      where: { id },
      data,
    });
  }

  async deleteVideo(userId: string, id: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const video = await this.prisma.video.findUnique({ where: { id } });

    const isOwner = video && ((artist && video.artistId === artist.id) || (video.userId === userId));
    if (!isOwner) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your video' } });

    await this.prisma.video.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  async streamVideo(userId: string, id: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.status !== 'ACTIVE') {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    const hasAccess = await this.accessControlService.canAccessVideo(userId, video as any);
    if (!hasAccess) {
      throw new HttpException({
        success: false,
        error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to stream this video' },
      }, 403);
    }

    return { streamUrl: video.videoUrl, duration: video.duration };
  }

  async toggleLike(userId: string, id: string) {
    const video = await this.prisma.video.findUnique({ where: { id }, select: { artistId: true } });
    if (!video) throw new NotFoundException({ success: false, error: 'Video not found' });

    try {
      await this.prisma.like.create({ data: { userId, videoId: id } });
      if (video.artistId) {
        await this.prisma.userArtistAffinity.upsert({
          where: { userId_artistId: { userId, artistId: video.artistId } },
          create: { userId, artistId: video.artistId, score: 5 },
          update: { score: { increment: 5 } },
        });
      }
      return { liked: true };
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existing = await this.prisma.like.findUnique({ where: { userId_videoId: { userId, videoId: id } } });
        if (existing) {
          await this.prisma.like.delete({ where: { id: existing.id } });
          if (video.artistId) {
            const affinity = await this.prisma.userArtistAffinity.findUnique({
              where: { userId_artistId: { userId, artistId: video.artistId } }
            });
            if (affinity) {
              await this.prisma.userArtistAffinity.update({
                where: { id: affinity.id },
                data: { score: Math.max(0, affinity.score - 5) },
              });
            }
          }
          return { liked: false };
        }
      }
      throw err;
    }
  }

  async watchVideo(userId: string, id: string, watchDurationSec: number, completed: boolean) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException({ success: false, error: 'Video not found' });

    if (video.price > 0) {
      const hasAccess = await this.accessControlService.canAccessVideo(userId, video as any);
      if (!hasAccess) {
        throw new HttpException({
          success: false,
          error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to register view' },
        }, 403);
      }
    }

    const existingView = await this.prisma.userVideoView.findUnique({
      where: { userId_videoId: { userId, videoId: id } }
    });

    const maxAllowedDuration = video.duration > 0 ? Math.min(video.duration + 10, 3600) : 3600;
    const sanitizedDuration = Math.min(watchDurationSec, maxAllowedDuration);
    const ratio = video.duration > 0 ? sanitizedDuration / video.duration : 1;

    let scoreChange = 0;
    if (ratio > 0.6 || completed) scoreChange = 2;
    else if (sanitizedDuration < 3 && video.duration > 5) scoreChange = -1;

    if (scoreChange !== 0 && video.artistId && !existingView) {
      await this.prisma.$executeRaw`
        INSERT INTO "user_artist_affinities" ("id", "userId", "artistId", "score", "updatedAt")
        VALUES (${randomUUID()}, ${userId}, ${video.artistId}, ${Math.max(scoreChange, 0)}, NOW())
        ON CONFLICT ("userId", "artistId")
        DO UPDATE SET "score" = GREATEST("user_artist_affinities"."score" + ${scoreChange}, 0), "updatedAt" = NOW();
      `;
    }

    if ((ratio > 0.15 || completed) && !existingView) {
      try {
        await this.prisma.$transaction([
          this.prisma.userVideoView.create({ data: { userId, videoId: id } }),
          this.prisma.video.update({ where: { id }, data: { views: { increment: 1 } } })
        ]);
      } catch (e: any) {
        if (e.code !== 'P2002') console.error('Error tracking view:', e);
      }
    }
  }

  async commentVideo(userId: string, id: string, content: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.status !== 'ACTIVE') throw new NotFoundException({ success: false, error: 'Video not found' });

    return this.prisma.comment.create({
      data: { userId, videoId: id, content },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async getComments(id: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [total, comments] = await Promise.all([
      this.prisma.comment.count({ where: { videoId: id } }),
      this.prisma.comment.findMany({
        where: { videoId: id },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      }),
    ]);

    return {
      data: comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }
}

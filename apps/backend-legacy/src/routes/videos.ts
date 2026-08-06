import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate, requireArtist } from '../middleware/auth.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { mediaProcessingQueue } from '../queues/index.js';
import { NotificationService } from '../services/notification.service.js';
import { AccessControlService } from '../services/access.service.js';
import { redis } from '../lib/redis.js';

import { randomUUID } from 'crypto';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';

const CreateVideoSchema = z.object({
  title: z.string().min(1).max(200),
  videoUrl: z.string().url(),
  s3Key: z.string(),
  thumbnailUrl: z.string().optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['CLIP', 'SHORT']),
  duration: z.number().default(0),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  isExplicit: z.boolean().default(false),
  // Champs Studio Reel
  audioTrackId: z.string().optional(),
  originalAudioName: z.string().optional(),
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
  audioVolume: z.number().min(0).max(1).optional(),
  videoVolume: z.number().min(0).max(1).optional(),
});

const VerifyAudioRightsSchema = z.object({
  trackId: z.string().optional(),
  audioTitle: z.string().optional(),
  videoUrl: z.string().optional(),
  videoS3Key: z.string().optional(),
  originalAudioName: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const UpdateVideoSchema = CreateVideoSchema.omit({ videoUrl: true, s3Key: true, type: true }).partial();

const VideoQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  type: z.enum(['CLIP', 'SHORT']).optional(),
  artistId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'popular', 'for_you']).default('newest'),
  refresh: z.coerce.boolean().optional(),
});

function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function videoRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/videos
   * List videos (public, filterable by type and artist)
   */
  fastify.get('/', async (request, reply) => {
    const query = VideoQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }

    const { page, limit, type, artistId, search, sort, refresh } = query.data;
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

    const orderBy: any = sort === 'popular' ? { views: 'desc' } : { createdAt: 'desc' };

    let userId: string | null = null;
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
      }
    } catch(_e) {}

    let total = 0;
    let videos: any[] = [];

    if (sort === 'for_you') {
      try {
        const anonSessionHeader = (request.headers['x-session-id'] || request.headers['x-anonymous-id']) as string | undefined;
        const sessionId = userId || anonSessionHeader || request.ip || 'anonymous';
        const redisKey = `feed:${type || 'ALL'}:${sessionId}`;
        const lockKey = `lock:${redisKey}`;

        if (refresh) {
          await redis.del(redisKey);
        }

        const startIdx = skip;
        const endIdx = skip + limit - 1;
        let selectedIds = await redis.lrange(redisKey, startIdx, endIdx);

        if (selectedIds.length === 0) {
          // Attempt to acquire distributed lock for cache filling
          let lockAcquired = false;
          try {
            const res = await redis.set(lockKey, '1', 'EX', 10, 'NX');
            lockAcquired = res === 'OK';
          } catch (_err) {}

          if (!lockAcquired) {
            // Wait for parallel request to finish cache generation
            for (let i = 0; i < 3; i++) {
              await new Promise(r => setTimeout(r, 250));
              selectedIds = await redis.lrange(redisKey, startIdx, endIdx);
              if (selectedIds.length > 0) break;
            }
          }

          // If still empty after waiting (or we acquired lock), compute new feed
          if (selectedIds.length === 0) {
            try {
              // Reset key if user has scrolled beyond queue boundary
              const existingLen = await redis.llen(redisKey);
              if (existingLen > 0 && startIdx >= existingLen) {
                await redis.del(redisKey);
              }

              let seenVideoIds: string[] = [];
              let topArtistIds: string[] = [];

              if (userId) {
                const seenViews = await prisma.userVideoView.findMany({
                  where: { userId },
                  select: { videoId: true }
                });
                seenVideoIds = seenViews.map(v => v.videoId);

                const affinities = await prisma.userArtistAffinity.findMany({
                  where: { userId },
                  orderBy: { score: 'desc' },
                  take: 10,
                });
                topArtistIds = affinities.map(a => a.artistId);
              }

              const pickRandomIds = async (condition: any, maxCount: number) => {
                if (maxCount <= 0) return [];
                const allIds = await prisma.video.findMany({
                  where: condition,
                  select: { id: true }
                });
                fisherYatesShuffle(allIds);
                return allIds.slice(0, maxCount).map(v => v.id);
              };

              let newIds: string[] = [];

              if (topArtistIds.length > 0) {
                const favIds = await pickRandomIds({ ...where, id: { notIn: seenVideoIds }, artistId: { in: topArtistIds } }, 350);
                const discCount = 150 + (350 - favIds.length);
                const discIds = await pickRandomIds({ ...where, id: { notIn: [...seenVideoIds, ...favIds] }, artistId: { notIn: topArtistIds } }, discCount);
                newIds = [...favIds, ...discIds];
              } else {
                newIds = await pickRandomIds({ ...where, id: { notIn: seenVideoIds } }, 500);
              }

              if (newIds.length < 500) {
                const fallbackIds = await pickRandomIds({ ...where, id: { notIn: newIds } }, 500 - newIds.length);
                newIds = [...newIds, ...fallbackIds];
              }

              // True Fisher-Yates shuffle
              fisherYatesShuffle(newIds);

              if (newIds.length > 0) {
                await redis.rpush(redisKey, ...newIds);
                await redis.expire(redisKey, 86400); // 24h

                // Handle reading from startIdx or reset offset if user scrolled past queue
                const effectiveStartIdx = startIdx >= newIds.length ? (startIdx % newIds.length) : startIdx;
                const effectiveEndIdx = effectiveStartIdx + limit - 1;
                selectedIds = newIds.slice(effectiveStartIdx, effectiveEndIdx + 1);
              }
            } finally {
              if (lockAcquired) {
                await redis.del(lockKey).catch(() => {});
              }
            }
          }
        }

        let mixVideos: any[] = [];
        if (selectedIds.length > 0) {
          mixVideos = await prisma.video.findMany({
            where: { id: { in: selectedIds } },
            include: {
              artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
              user: { select: { id: true, name: true, avatar: true } },
              _count: { select: { likes: true, comments: true } },
              likes: userId ? { where: { userId } } : false,
            },
          });
        }

        // Preserve exact Redis queue order using Map lookup (O(N))
        const videoMap = new Map(mixVideos.map(v => [v.id, v]));
        videos = selectedIds.map(id => videoMap.get(id)).filter(Boolean);
        
        total = 9999999;
      } catch (feedError) {
        console.error('Error calculating for_you feed, falling back:', feedError);
        const [t, v] = await Promise.all([
          prisma.video.count({ where }),
          prisma.video.findMany({
            where,
            orderBy: { createdAt: 'desc' },
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
        total = t;
        videos = v;
      }
    } else {
      // Normal 'newest' or 'popular'
      const actualOrderBy = sort === 'popular' ? { views: 'desc' as const } : { createdAt: 'desc' as const };
      const [t, v] = await Promise.all([
        prisma.video.count({ where }),
        prisma.video.findMany({
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
      total = t;
      videos = v;
    }
    
    const formattedVideos = videos.map((v: any) => ({
      ...v,
      artist: v.artist || { id: v.user?.id, stageName: v.user?.name, avatar: v.user?.avatar, isVerified: false },
      hasLiked: v.likes ? v.likes.length > 0 : false,
      likes: undefined // remove the raw likes array from response
    }));

    return reply.send({
      success: true,
      data: formattedVideos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  /**
   * GET /api/v1/videos/mine
   * Get my videos (artist dashboard)
   */
  fastify.get('/mine', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      type: z.enum(['CLIP', 'SHORT']).optional(),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });

    const { page, limit, type } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { status: { not: 'INACTIVE' } };
    
    if (artist) {
      where.artistId = artist.id;
    } else {
      where.userId = user.userId;
    }
    if (type) where.type = type;

    const [total, videos] = await Promise.all([
      prisma.video.count({ where }),
      prisma.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { likes: true, comments: true } } },
      }),
    ]);

    return reply.send({
      success: true,
      data: videos,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  /**
   * POST /api/v1/videos/verify-audio-rights
   * Vérifie si un utilisateur possède les droits sur un morceau de musique (empreinte spectrale + catalogue) avant publication d'un Reel.
   */
  fastify.post('/verify-audio-rights', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = VerifyAudioRightsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides' } });
    }

    const rightsResult = await AudioFingerprintService.analyzeAndDetectCopyright({
      userId: user.userId,
      trackId: body.data.trackId,
      audioTitle: body.data.audioTitle,
      videoS3Key: body.data.videoS3Key,
      videoUrl: body.data.videoUrl,
      originalAudioName: body.data.originalAudioName,
      title: body.data.title,
      description: body.data.description,
    });

    return reply.send({
      success: true,
      data: rightsResult,
    });
  });

  /**
   * POST /api/v1/videos
   * Upload a new video (clip or short/reel)
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const parsed = CreateVideoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    
    // Only artists can publish CLIPs
    if (parsed.data.type === 'CLIP' && !artist) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only artists can publish clips' } });
    }

    // Vérification des droits d'auteur incontournable par Empreinte Acoustique Multi-Couches
    const rightsCheck = await AudioFingerprintService.analyzeAndDetectCopyright({
      userId: user.userId,
      trackId: parsed.data.audioTrackId,
      originalAudioName: parsed.data.originalAudioName,
      videoS3Key: parsed.data.s3Key,
      videoUrl: parsed.data.videoUrl,
      title: parsed.data.title,
      description: parsed.data.description,
    });

    if (!rightsCheck.isAuthorized) {
      return reply.status(402).send({
        success: false,
        error: {
          code: 'PAYMENT_REQUIRED',
          message: rightsCheck.message,
          tokensRequired: rightsCheck.tokensRequired,
          matchedTrack: rightsCheck.matchedTrack,
        },
      });
    }

    const artistId = artist ? artist.id : null;
    const userId = !artist ? user.userId : null;

    const video = await prisma.video.create({
      data: {
        artistId,
        userId,
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        videoUrl: parsed.data.videoUrl,
        s3Key: parsed.data.s3Key,
        thumbnailUrl: parsed.data.thumbnailUrl || '',
        duration: parsed.data.duration,
        price: parsed.data.price,
        currency: parsed.data.currency,
        isExplicit: parsed.data.isExplicit,
        // Métadonnées studio
        audioTrackId: parsed.data.audioTrackId || null,
        originalAudioName: parsed.data.originalAudioName || null,
        trimStart: parsed.data.trimStart ?? 0,
        trimEnd: parsed.data.trimEnd || null,
        audioVolume: parsed.data.audioVolume ?? 1.0,
        videoVolume: parsed.data.videoVolume ?? 1.0,
        status: 'ACTIVE', // Bypass processing for now
      },
    });

    // Queue video transcoding job
    await mediaProcessingQueue.add('transcode-video', {
      type: 'TRANSCODE_VIDEO',
      payload: { videoId: video.id },
    });

    // Queue post-upload audio verification (asynchrone, Couche 4 du pipeline)
    await mediaProcessingQueue.add('verify-video-audio', {
      type: 'VERIFY_VIDEO_AUDIO',
      payload: { videoId: video.id },
    }, { delay: 5000 }); // Attendre 5s que le transcodage commence

    // Notify followers if published by an artist
    if (artistId) {
      const videoTypeStr = video.type === 'CLIP' ? 'un nouveau clip' : 'un nouveau reel';
      NotificationService.notifyFollowers(artistId, 'NEW_VIDEO', {
        title: video.type === 'CLIP' ? 'Nouveau Clip' : 'Nouveau Reel',
        body: `${artist!.stageName} a publié ${videoTypeStr} : "${video.title}"`,
        data: { videoId: video.id }
      }).catch(console.error);
    }

    return reply.status(201).send({ success: true, data: video });
  });

  /**
   * GET /api/v1/videos/:id
   * Get single video + increment view count
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    let userId: string | null = null;
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
      }
    } catch(_e) {}

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, isVerified: true, totalFollowers: true } },
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    if (!video || video.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    let hasWatched = false;
    if (userId) {
      const view = await prisma.userVideoView.findUnique({
        where: { userId_videoId: { userId, videoId: id } }
      });
      hasWatched = !!view;
    }

    const formattedVideo = {
      ...video,
      artist: video.artist || { id: (video as any).user?.id, stageName: (video as any).user?.name, avatar: (video as any).user?.avatar, isVerified: false },
      hasWatched
    };

    // Note: view count is tracked via POST /:id/watch for accuracy (avoids double-counting)
    return reply.send({ success: true, data: formattedVideo });
  });

  /**
   * PATCH /api/v1/videos/:id
   * Update a video (owner only)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const parsed = UpdateVideoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const video = await prisma.video.findUnique({ where: { id } });

    const isOwner = video && ((artist && video.artistId === artist.id) || (video.userId === user.userId));
    if (!isOwner) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your video' } });
    }

    const updated = await prisma.video.update({
      where: { id },
      data: parsed.data,
    });

    return reply.send({ success: true, data: updated });
  });

  /**
   * DELETE /api/v1/videos/:id
   * Soft-delete a video (mark as INACTIVE)
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const video = await prisma.video.findUnique({ where: { id } });

    const isOwner = video && ((artist && video.artistId === artist.id) || (video.userId === user.userId));
    if (!isOwner) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your video' } });
    }

    await prisma.video.update({ where: { id }, data: { status: 'INACTIVE' } });
    return reply.send({ success: true, data: null });
  });

  /**
   * GET /api/v1/videos/:id/stream
   * Get streaming URL (checks access rights for paid clips)
   */
  fastify.get('/:id/stream', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video || video.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    // Check if video is paid and user has access
    const hasAccess = await AccessControlService.canAccessVideo(user.userId, video);
    if (!hasAccess) {
      return reply.status(403).send({
        success: false,
        error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to stream this video' },
      });
    }

    return reply.send({
      success: true,
      data: {
        streamUrl: video.videoUrl,
        duration: video.duration,
      },
    });
  });

  /**
   * POST /api/v1/videos/:id/like
   * Like or unlike a video (atomic toggle with P2002 handling)
   */
  fastify.post('/:id/like', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const video = await prisma.video.findUnique({ where: { id }, select: { artistId: true } });
    if (!video) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });

    try {
      // Attempt direct atomic creation first
      await prisma.like.create({ data: { userId: user.userId, videoId: id } });

      if (video.artistId) {
        await prisma.userArtistAffinity.upsert({
          where: { userId_artistId: { userId: user.userId, artistId: video.artistId } },
          create: { userId: user.userId, artistId: video.artistId, score: 5 },
          update: { score: { increment: 5 } },
        });
      }
      return reply.send({ success: true, data: { liked: true } });
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Unique constraint violation -> Already liked -> Toggle OFF
        const existing = await prisma.like.findUnique({ where: { userId_videoId: { userId: user.userId, videoId: id } } });
        if (existing) {
          await prisma.like.delete({ where: { id: existing.id } });
          if (video.artistId) {
            const affinity = await prisma.userArtistAffinity.findUnique({
              where: { userId_artistId: { userId: user.userId, artistId: video.artistId } }
            });
            if (affinity) {
              const newScore = Math.max(0, affinity.score - 5);
              await prisma.userArtistAffinity.update({
                where: { id: affinity.id },
                data: { score: newScore },
              });
            }
          }
          return reply.send({ success: true, data: { liked: false } });
        }
      }
      throw err;
    }
  });

  /**
   * POST /api/v1/videos/:id/watch
   * Track watch time for reels algorithm (for_you) with view deduplication
   */
  fastify.post('/:id/watch', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    const body = z.object({ watchDurationSec: z.number().min(0).max(3600), completed: z.boolean().default(false) }).safeParse(request.body);
    
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });

    // Check if video is paid and user has access
    if (video.price > 0) {
      const hasAccess = await AccessControlService.canAccessVideo(user.userId, video);
      if (!hasAccess) {
        return reply.status(403).send({
          success: false,
          error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to register view' },
        });
      }
    }

    const existingView = await prisma.userVideoView.findUnique({
      where: { userId_videoId: { userId: user.userId, videoId: id } }
    });

    // Sanitize watch duration (cannot exceed video duration + 10s or max 3600s)
    const maxAllowedDuration = video.duration > 0 ? Math.min(video.duration + 10, 3600) : 3600;
    const sanitizedDuration = Math.min(body.data.watchDurationSec, maxAllowedDuration);

    let scoreChange = 0;
    const ratio = video.duration > 0 ? sanitizedDuration / video.duration : 1;

    // > 60% watched or completed = +2 points
    if (ratio > 0.6 || body.data.completed) {
      scoreChange = 2;
    } 
    // Skipped very fast (< 3 seconds on a longer video) = -1 point
    else if (sanitizedDuration < 3 && video.duration > 5) {
      scoreChange = -1;
    }

    // Anti-abus : score mis à jour uniquement s'il s'agit d'une nouvelle vue
    if (scoreChange !== 0 && video.artistId && !existingView) {
      await prisma.$executeRaw`
        INSERT INTO "user_artist_affinities" ("id", "userId", "artistId", "score", "updatedAt")
        VALUES (${randomUUID()}, ${user.userId}, ${video.artistId}, ${Math.max(scoreChange, 0)}, NOW())
        ON CONFLICT ("userId", "artistId")
        DO UPDATE SET "score" = GREATEST("user_artist_affinities"."score" + ${scoreChange}, 0), "updatedAt" = NOW();
      `;
    }

    // Deduplicated unique view count increment
    if ((ratio > 0.15 || body.data.completed) && user?.userId) {
      if (!existingView) {
        try {
          await prisma.$transaction([
            prisma.userVideoView.create({
              data: { userId: user.userId, videoId: id }
            }),
            prisma.video.update({
              where: { id },
              data: { views: { increment: 1 } }
            })
          ]);
        } catch (e: any) {
          if (e.code !== 'P2002') console.error('Error tracking view:', e);
        }
      }
    }

    return reply.send({ success: true });
  });

  /**
   * POST /api/v1/videos/:id/comment
   * Add a comment to a video
   */
  fastify.post('/:id/comment', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    const body = z.object({ content: z.string().min(1).max(500) }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Content required' } });

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video || video.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    const comment = await prisma.comment.create({
      data: { userId: user.userId, videoId: id, content: body.data.content },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    return reply.status(201).send({ success: true, data: comment });
  });

  /**
   * GET /api/v1/videos/:id/comments
   * Get comments for a video
   */
  fastify.get('/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const { page, limit } = query.data;
    const skip = (page - 1) * limit;

    const [total, comments] = await Promise.all([
      prisma.comment.count({ where: { videoId: id } }),
      prisma.comment.findMany({
        where: { videoId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      }),
    ]);

    return reply.send({
      success: true,
      data: comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });
}

import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate, requireArtist } from '../middleware/auth.js';
import { z } from 'zod';
import { mediaProcessingQueue } from '../queues/index.js';
import { AccessControlService } from '../services/access.service.js';
import { publishUserUpdate } from '../lib/redisPubSub.js';
import { NotificationService } from '../services/notification.service.js';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';

const TrackQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  genre: z.string().optional(),
  artistId: z.string().optional(),
  albumId: z.string().optional(),
  isSingle: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  search: z.string().optional(),
  sort: z.enum(['newest', 'popular', 'price_asc', 'price_desc']).default('newest'),
});

const CreateTrackSchema = z.object({
  title: z.string().min(1).max(200),
  audioUrl: z.string().url(),
  s3Key: z.string(),
  coverUrl: z.string().url().optional(),
  duration: z.number().default(0),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  genre: z.array(z.string()).default([]),
  albumId: z.string().optional(),
  releaseDate: z.string().datetime().optional(),
  isExplicit: z.boolean().default(false),
  bpm: z.number().optional(),
  key: z.string().optional(),
});

const UpdateTrackSchema = CreateTrackSchema.omit({ audioUrl: true, s3Key: true }).partial();

export async function trackRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/tracks
   * Create a new track (Artist only)
   */
  fastify.post('/', { preValidation: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Artist role required' } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const parsed = CreateTrackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });
    }

    // Validate albumId belongs to this artist if provided
    if (parsed.data.albumId) {
      const album = await prisma.album.findUnique({ where: { id: parsed.data.albumId } });
      if (!album || album.artistId !== artist.id) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_ALBUM', message: 'Album not found or not yours' } });
      }
    }

    // Le fingerprint Chromaprint réel sera généré par le worker BullMQ après transcodage audio
    const track = await prisma.track.create({
      data: {
        title: parsed.data.title,
        audioUrl: parsed.data.audioUrl,
        s3Key: parsed.data.s3Key,
        fingerprint: null, // Sera rempli par le job GENERATE_TRACK_FINGERPRINT
        duration: parsed.data.duration,
        coverUrl: parsed.data.coverUrl || artist.coverImage || artist.avatar || '',
        price: parsed.data.price,
        currency: parsed.data.currency,
        genre: parsed.data.genre,
        albumId: parsed.data.albumId,
        isExplicit: parsed.data.isExplicit,
        bpm: parsed.data.bpm,
        key: parsed.data.key,
        artistId: artist.id,
        status: 'PROCESSING',
        releaseDate: parsed.data.releaseDate ? new Date(parsed.data.releaseDate) : null,
      },
    });

    await mediaProcessingQueue.add('transcode-audio', {
      type: 'TRANSCODE_AUDIO',
      payload: { trackId: track.id },
    });

    // Job de génération de fingerprint Chromaprint (après transcodage)
    await mediaProcessingQueue.add('generate-track-fingerprint', {
      type: 'GENERATE_TRACK_FINGERPRINT',
      payload: { trackId: track.id },
    }, { delay: 10000 }); // Attendre 10s que le transcodage démarre

    // Invalider le cache du catalogue payant
    await AudioFingerprintService.invalidateCatalogCache();

    // Notify followers
    const genreText = track.genre && track.genre.length > 0 ? ` (${track.genre[0]})` : '';
    NotificationService.notifyFollowers(artist.id, 'NEW_TRACK', {
      title: 'Nouveau Son',
      body: `${artist.stageName} a publié une nouvelle musique${genreText} : "${track.title}"`,
      data: { trackId: track.id }
    }).catch(console.error);

    return reply.status(201).send({ success: true, data: track });
  });

  /**
   * GET /api/v1/tracks
   * List tracks with filters and pagination
   */
  fastify.get('/', async (request, reply) => {
    const query = TrackQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
    }

    const { page, limit, genre, artistId, albumId, isSingle, search, sort } = query.data;
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
      prisma.track.count({ where }),
      prisma.track.findMany({
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

    return reply.send({
      success: true,
      data: tracks,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  });

  /**
   * GET /api/v1/tracks/mine
   * Get my tracks (artist dashboard)
   */
  fastify.get('/mine', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      status: z.enum(['PROCESSING', 'ACTIVE', 'INACTIVE']).optional(),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });

    const { page, limit, status } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { artistId: artist.id };
    if (status) where.status = status;

    const [total, tracks] = await Promise.all([
      prisma.track.count({ where }),
      prisma.track.findMany({
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

    return reply.send({
      success: true,
      data: tracks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  /**
   * GET /api/v1/tracks/:id
   * Get single track details (metadata only, does NOT increment play count)
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const track = await prisma.track.findUnique({
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
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Track not found' },
      });
    }

    return reply.send({ success: true, data: track });
  });

  /**
   * PATCH /api/v1/tracks/:id
   * Update a track (artist owner only)
   */
  fastify.patch('/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const parsed = UpdateTrackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const track = await prisma.track.findUnique({ where: { id } });

    if (!track || !artist || track.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your track' } });
    }

    const updated = await prisma.track.update({
      where: { id },
      data: {
        ...parsed.data,
        releaseDate: parsed.data.releaseDate ? new Date(parsed.data.releaseDate) : undefined,
      },
    });

    return reply.send({ success: true, data: updated });
  });

  /**
   * DELETE /api/v1/tracks/:id
   * Delete a track (artist owner only)
   */
  fastify.delete('/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const track = await prisma.track.findUnique({ where: { id } });

    if (!track || !artist || track.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your track' } });
    }

    // Soft delete — mark as INACTIVE rather than deleting
    await prisma.track.update({ where: { id }, data: { status: 'INACTIVE' } });
    return reply.send({ success: true, data: null });
  });

  /**
   * GET /api/v1/tracks/:id/stream
   * Get streaming URL (checks access rights & increments plays count)
   */
  fastify.get('/:id/stream', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const track = await prisma.track.findUnique({ where: { id } });
    if (!track || track.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
    }

    // Check if track is paid and user has access
    const hasAccess = await AccessControlService.canAccessTrack(user.userId, track);
    if (!hasAccess) {
      return reply.status(403).send({
        success: false,
        error: { code: 'PAYMENT_REQUIRED', message: 'Purchase or active subscription required to stream this track' },
      });
    }

    // Increment play count (non-blocking) on stream start
    prisma.track.update({ where: { id }, data: { plays: { increment: 1 } } }).catch(() => {});

    return reply.send({
      success: true,
      data: {
        streamUrl: track.audioUrl,
        duration: track.duration,
      },
    });
  });

  /**
   * POST /api/v1/tracks/:id/play
   * Explicit audio play event reporter (increments plays count)
   */
  fastify.post('/:id/play', async (request, reply) => {
    const { id } = request.params as { id: string };
    prisma.track.update({ where: { id }, data: { plays: { increment: 1 } } }).catch(() => {});
    return reply.send({ success: true });
  });

  /**
   * POST /api/v1/tracks/:id/like
   * Like or unlike a track (atomic toggle with P2002 handling)
   */
  fastify.post('/:id/like', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const track = await prisma.track.findUnique({ where: { id }, select: { artistId: true } });
    if (!track) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });

    try {
      await prisma.like.create({ data: { userId: user.userId, trackId: id } });
      
      if (track.artistId) {
        const artist = await prisma.artistProfile.findUnique({ where: { id: track.artistId } });
        if (artist) {
          publishUserUpdate(artist.userId, {
            type: 'NEW_LIKE',
            trackId: id,
            userId: user.userId
          });
        }
      }

      return reply.send({ success: true, data: { liked: true } });
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existing = await prisma.like.findUnique({
          where: { userId_trackId: { userId: user.userId, trackId: id } },
        });
        if (existing) {
          await prisma.like.delete({ where: { id: existing.id } });
          return reply.send({ success: true, data: { liked: false } });
        }
      }
      throw err;
    }
  });
}

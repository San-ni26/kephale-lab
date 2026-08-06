import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate, requireArtist } from '../middleware/auth.js';
import { z } from 'zod';
import { AccessControlService } from '../services/access.service.js';
import { NotificationService } from '../services/notification.service.js';

const CreateAlbumSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url(),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  releaseDate: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const UpdateAlbumSchema = CreateAlbumSchema.partial();

const AlbumQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  artistId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).default('ACTIVE'),
  search: z.string().optional(),
  genre: z.string().optional(),
});

export async function albumRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/albums
   * Create a new album (Artist only)
   */
  fastify.post('/', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const body = CreateAlbumSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const album = await prisma.album.create({
      data: {
        artistId: artist.id,
        title: body.data.title,
        description: body.data.description,
        coverUrl: body.data.coverUrl,
        price: body.data.price,
        currency: body.data.currency,
        status: body.data.status,
        releaseDate: body.data.releaseDate ? new Date(body.data.releaseDate) : null,
      },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true } },
        _count: { select: { tracks: true } },
      },
    });

    // Notify followers
    NotificationService.notifyFollowers(artist.id, 'NEW_ALBUM', {
      title: 'Nouvel Album',
      body: `${artist.stageName} a publié un nouvel album : "${album.title}"`,
      data: { albumId: album.id }
    }).catch(console.error);

    return reply.status(201).send({ success: true, data: album });
  });

  /**
   * GET /api/v1/albums
   * List albums (public)
   */
  fastify.get('/', async (request, reply) => {
    const query = AlbumQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }

    const { page, limit, artistId, status, search, genre } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { status };
    if (artistId) where.artistId = artistId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } }
      ];
    }
    if (genre) {
      where.tracks = { some: { genre: { has: genre } } };
    }

    const [total, albums] = await Promise.all([
      prisma.album.count({ where }),
      prisma.album.findMany({
        where,
        skip,
        take: limit,
        orderBy: { releaseDate: 'desc' },
        include: {
          artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
          _count: { select: { tracks: true, purchases: true } },
        },
      }),
    ]);

    return reply.send({
      success: true,
      data: albums,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  });

  /**
   * GET /api/v1/albums/mine
   * Get my albums (artist dashboard)
   */
  fastify.get('/mine', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });

    const { page, limit } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { artistId: artist.id };

    const [total, albums] = await Promise.all([
      prisma.album.count({ where }),
      prisma.album.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tracks: true, purchases: true } },
        },
      }),
    ]);

    return reply.send({
      success: true,
      data: albums,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  /**
   * GET /api/v1/albums/:id
   * Get album detail with tracks
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, coverImage: true, isVerified: true } },
        tracks: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: {
            _count: { select: { likes: true } },
          },
        },
        _count: { select: { tracks: true, purchases: true } },
      },
    });

    if (!album) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Album not found' } });
    }

    return reply.send({ success: true, data: album });
  });

  /**
   * GET /api/v1/albums/:id/status
   * Check if the authenticated user has purchased this album
   */
  fastify.get('/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const album = await prisma.album.findUnique({ where: { id } });
    if (!album) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Album not found' } });
    }

    const isPurchased = await AccessControlService.canAccessAlbum(user.userId, album);

    return reply.send({ success: true, data: { isPurchased } });
  });

  /**
   * PATCH /api/v1/albums/:id
   * Update album (artist owner only)
   */
  fastify.patch('/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const body = UpdateAlbumSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const album = await prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    const updated = await prisma.album.update({
      where: { id },
      data: {
        ...body.data,
        releaseDate: body.data.releaseDate ? new Date(body.data.releaseDate) : undefined,
      },
      include: {
        _count: { select: { tracks: true } },
      },
    });

    return reply.send({ success: true, data: updated });
  });

  /**
   * DELETE /api/v1/albums/:id
   * Delete album (artist owner only)
   */
  fastify.delete('/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const album = await prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    // Detach tracks from album before deleting (preserve the tracks)
    await prisma.track.updateMany({
      where: { albumId: id },
      data: { albumId: null },
    });

    await prisma.album.delete({ where: { id } });
    return reply.send({ success: true, data: null });
  });

  /**
   * POST /api/v1/albums/:id/tracks
   * Add an existing track to an album
   */
  fastify.post('/:id/tracks', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    const body = z.object({ trackId: z.string() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'trackId required' } });

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const album = await prisma.album.findUnique({ where: { id } });
    const track = await prisma.track.findUnique({ where: { id: body.data.trackId } });

    if (!album || !artist || album.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    if (!track || track.artistId !== artist.id) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TRACK', message: 'Track not found or not yours' } });
    }

    await prisma.track.update({
      where: { id: body.data.trackId },
      data: { albumId: id },
    });

    return reply.send({ success: true, data: null });
  });

  /**
   * DELETE /api/v1/albums/:id/tracks/:trackId
   * Remove a track from an album (detach, not delete)
   */
  fastify.delete('/:id/tracks/:trackId', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id, trackId } = request.params as { id: string; trackId: string };
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    const album = await prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    await prisma.track.updateMany({
      where: { id: trackId, albumId: id, artistId: artist.id },
      data: { albumId: null },
    });

    return reply.send({ success: true, data: null });
  });
}

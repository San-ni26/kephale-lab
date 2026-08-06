import { FastifyInstance } from 'fastify';
import { prisma, Role } from '@kephale/database';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate, requireArtist } from '../middleware/auth.js';
import { publishUserUpdate } from '../lib/redisPubSub.js';

const CreateArtistSchema = z.object({
  stageName: z.string().min(2).max(100),
  bio: z.string().max(2000).optional(),
  genre: z.array(z.string()).default([]),
  country: z.string().length(2).default('ML'),
  avatar: z.string().url().optional(),
  coverImage: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  instagramUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
});

const UpdateArtistSchema = CreateArtistSchema.partial();

export async function artistRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/artists
   * Create artist profile (linked to existing user account)
   */
  fastify.post('/', { preValidation: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const parsed = CreateArtistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });
    }

    // Check if artist profile already exists
    const existing = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (existing) {
      return reply.status(400).send({ success: false, error: { code: 'ALREADY_EXISTS', message: 'User already has an artist profile' } });
    }

    // Check if stageName is already taken
    const existingName = await prisma.artistProfile.findUnique({
      where: { stageName: parsed.data.stageName }
    });
    if (existingName) {
      return reply.status(400).send({ success: false, error: { code: 'STAGENAME_TAKEN', message: 'Ce nom de scène est déjà utilisé' } });
    }

    // Create profile and update user role atomically
    const profile = await prisma.$transaction(async (tx) => {
      const newProfile = await tx.artistProfile.create({
        data: {
          userId: user.userId,
          stageName: parsed.data.stageName,
          bio: parsed.data.bio,
          genre: parsed.data.genre,
          country: parsed.data.country,
          avatar: parsed.data.avatar,
          coverImage: parsed.data.coverImage,
          websiteUrl: parsed.data.websiteUrl,
          instagramUrl: parsed.data.instagramUrl,
          twitterUrl: parsed.data.twitterUrl,
        },
      });

      await tx.user.update({
        where: { id: user.userId },
        data: { 
          role: Role.ARTIST,
          name: parsed.data.stageName,
          ...(parsed.data.avatar ? { avatar: parsed.data.avatar } : {})
        },
      });

      return newProfile;
    });

    const accessToken = jwt.sign(
      { userId: user.userId, role: Role.ARTIST },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any }
    );
    const refreshToken = jwt.sign(
      { userId: user.userId, role: Role.ARTIST },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
    );

    return reply.status(201).send({ 
      success: true, 
      data: profile,
      tokens: { accessToken, refreshToken }
    });
  });

  /**
   * PATCH /api/v1/artists/me
   * Update own artist profile
   */
  fastify.patch('/me', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const parsed = UpdateArtistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    if (parsed.data.stageName && parsed.data.stageName !== artist.stageName) {
      const existingName = await prisma.artistProfile.findUnique({
        where: { stageName: parsed.data.stageName }
      });
      if (existingName) {
        return reply.status(400).send({ success: false, error: { code: 'STAGENAME_TAKEN', message: 'Ce nom de scène est déjà utilisé' } });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedArtist = await tx.artistProfile.update({
        where: { id: artist.id },
        data: parsed.data,
        include: { _count: { select: { followers: true, tracks: true, videos: true, albums: true } } },
      });

      // Synchronize the user profile name and avatar if they were updated
      if (parsed.data.stageName || parsed.data.avatar) {
        await tx.user.update({
          where: { id: user.userId },
          data: {
            ...(parsed.data.stageName ? { name: parsed.data.stageName } : {}),
            ...(parsed.data.avatar ? { avatar: parsed.data.avatar } : {}),
          }
        });
      }

      return updatedArtist;
    });

    return reply.send({ success: true, data: updated });
  });

  /**
   * GET /api/v1/artists/me/dashboard
   * Get private dashboard stats for the logged-in artist
   */
  fastify.get('/me/dashboard', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({
      where: { userId: user.userId },
      include: {
        _count: {
          select: { followers: true, tracks: true, videos: true, albums: true },
        },
      },
    });
    if (!artist) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    // Aggregate plays across all active tracks
    const playsAgg = await prisma.track.aggregate({
      where: { artistId: artist.id, status: 'ACTIVE' },
      _sum: { plays: true },
    });

    // Aggregate views across all active videos
    const viewsAgg = await prisma.video.aggregate({
      where: { artistId: artist.id, status: 'ACTIVE' },
      _sum: { views: true },
    });

    // Total revenue from purchases
    const revenueAgg = await prisma.purchase.aggregate({
      where: {
        OR: [
          { track: { artistId: artist.id } },
          { album: { artistId: artist.id } },
        ],
        status: 'SUCCEEDED',
      },
      _sum: { artistAmount: true },
    });

    // Recent purchases (last 10)
    const recentPurchases = await prisma.purchase.findMany({
      where: {
        OR: [
          { track: { artistId: artist.id } },
          { album: { artistId: artist.id } },
        ],
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        track: { select: { id: true, title: true, coverUrl: true } },
        album: { select: { id: true, title: true, coverUrl: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Top tracks by plays
    const topTracks = await prisma.track.findMany({
      where: { artistId: artist.id, status: 'ACTIVE' },
      orderBy: { plays: 'desc' },
      take: 5,
      select: { id: true, title: true, coverUrl: true, plays: true, price: true },
    });

    // Recent uploads (tracks + videos combined)
    const recentTracks = await prisma.track.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, coverUrl: true, status: true, plays: true, createdAt: true },
    });

    const recentVideos = await prisma.video.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, thumbnailUrl: true, type: true, status: true, views: true, createdAt: true },
    });

    return reply.send({
      success: true,
      data: {
        artist,
        stats: {
          totalFollowers: artist._count.followers,
          totalTracks: artist._count.tracks,
          totalVideos: artist._count.videos,
          totalAlbums: artist._count.albums,
          totalPlays: playsAgg._sum.plays ?? 0,
          totalViews: viewsAgg._sum.views ?? 0,
          totalRevenue: revenueAgg._sum.artistAmount ?? 0,
          pendingPayout: artist.pendingPayout,
          totalEarnings: artist.totalEarnings,
        },
        recentPurchases,
        topTracks,
        recentUploads: {
          tracks: recentTracks,
          videos: recentVideos,
        },
      },
    });
  });

  /**
   * GET /api/v1/artists/me/sales
   * Get detailed sales history for the artist
   */
  fastify.get('/me/sales', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { message: 'Artist not found' } });

    const sales = await prisma.purchase.findMany({
      where: {
        OR: [
          { track: { artistId: artist.id } },
          { album: { artistId: artist.id } },
          { video: { artistId: artist.id } },
        ],
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        track: { select: { title: true, coverUrl: true } },
        album: { select: { title: true, coverUrl: true } },
        video: { select: { title: true, thumbnailUrl: true } },
      },
    });

    return reply.send({ success: true, data: sales });
  });

  /**
   * GET /api/v1/artists/me/withdrawals
   * Get withdrawal history for the artist
   */
  fastify.get('/me/withdrawals', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { message: 'Artist not found' } });

    const withdrawals = await prisma.withdrawal.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: withdrawals });
  });

  /**
   * POST /api/v1/artists/me/withdrawals
   * Request a withdrawal
   */
  fastify.post('/me/withdrawals', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const schema = z.object({
      amount: z.number().min(500), // Min 500 CFA (or equivalent)
      paymentMethod: z.string(),
      paymentDetails: z.string(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { message: 'Invalid input', details: parsed.error.issues } });
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { message: 'Artist not found' } });

    // Calculate available balance = totalEarnings - pendingPayout - (sum of completed withdrawals)
    // Wait, totalEarnings in our model might not automatically include all purchases unless we compute it or it's updated via a trigger.
    // Let's compute true earnings dynamically to be safe:
    const revenueAgg = await prisma.purchase.aggregate({
      where: {
        OR: [
          { track: { artistId: artist.id } },
          { album: { artistId: artist.id } },
          { video: { artistId: artist.id } },
        ],
        status: 'SUCCEEDED',
      },
      _sum: { artistAmount: true },
    });
    const trueTotalEarnings = revenueAgg._sum.artistAmount || 0;

    const previousWithdrawalsAgg = await prisma.withdrawal.aggregate({
      where: { artistId: artist.id, status: { in: ['COMPLETED', 'PROCESSING', 'PENDING'] } },
      _sum: { amount: true },
    });
    const totalWithdrawnOrPending = previousWithdrawalsAgg._sum.amount || 0;

    const availableBalance = trueTotalEarnings - totalWithdrawnOrPending;

    if (parsed.data.amount > availableBalance) {
      return reply.status(400).send({ success: false, error: { message: 'Solde insuffisant' } });
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          artistId: artist.id,
          amount: parsed.data.amount,
          paymentMethod: parsed.data.paymentMethod,
          paymentDetails: parsed.data.paymentDetails,
        }
      });
      // Update pending payout
      await tx.artistProfile.update({
        where: { id: artist.id },
        data: { pendingPayout: { increment: parsed.data.amount } }
      });
      return w;
    });

    return reply.status(201).send({ success: true, data: withdrawal });
  });

  /**
   * DELETE /api/v1/artists/me/withdrawals/:id
   * Cancel a pending withdrawal
   */
  fastify.delete('/me/withdrawals/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    
    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) return reply.status(404).send({ success: false, error: { message: 'Artist not found' } });

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id, artistId: artist.id } });
    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: { message: 'Retrait introuvable' } });
    }

    if (withdrawal.status !== 'PENDING') {
      return reply.status(400).send({ success: false, error: { message: 'Seuls les retraits en attente peuvent être annulés' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.delete({ where: { id } });
      
      await tx.artistProfile.update({
        where: { id: artist.id },
        data: { pendingPayout: { decrement: withdrawal.amount } }
      });
    });

    return reply.send({ success: true, data: null });
  });

  /**
   * GET /api/v1/artists
   * List all artists (public)
   */
  fastify.get('/', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
      search: z.string().optional(),
      genre: z.string().optional(),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const { page, limit, search, genre } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { isActive: true };
    if (genre) where.genre = { has: genre };
    if (search) where.stageName = { contains: search, mode: 'insensitive' };

    const [total, artists] = await Promise.all([
      prisma.artistProfile.count({ where }),
      prisma.artistProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { totalFollowers: 'desc' },
        include: { _count: { select: { followers: true, tracks: true, albums: true } } },
      }),
    ]);

    return reply.send({
      success: true,
      data: artists,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  /**
   * GET /api/v1/artists/:id
   * Get artist public profile
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artist = await prisma.artistProfile.findUnique({
      where: { id },
      include: {
        _count: { select: { followers: true, tracks: true, videos: true, albums: true } },
      },
    });
    if (!artist) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });
    return reply.send({ success: true, data: artist });
  });

  /**
   * GET /api/v1/artists/:id/stats
   * Get artist public stats
   */
  fastify.get('/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };

    const artist = await prisma.artistProfile.findUnique({ where: { id } });
    if (!artist) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });

    const [followersCount, tracksCount, videosCount, albumsCount, playsAgg, viewsAgg] = await Promise.all([
      prisma.follow.count({ where: { artistId: id } }),
      prisma.track.count({ where: { artistId: id, status: 'ACTIVE' } }),
      prisma.video.count({ where: { artistId: id, status: 'ACTIVE' } }),
      prisma.album.count({ where: { artistId: id, status: 'ACTIVE' } }),
      prisma.track.aggregate({ where: { artistId: id, status: 'ACTIVE' }, _sum: { plays: true } }),
      prisma.video.aggregate({ where: { artistId: id, status: 'ACTIVE' }, _sum: { views: true } }),
    ]);

    return reply.send({
      success: true,
      data: {
        followersCount,
        tracksCount,
        videosCount,
        albumsCount,
        totalPlays: playsAgg._sum.plays ?? 0,
        totalViews: viewsAgg._sum.views ?? 0,
      },
    });
  });

  /**
   * GET /api/v1/artists/:id/tracks
   * Get artist tracks (public, paginated)
   */
  fastify.get('/:id/tracks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
      isSingle: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
      sort: z.enum(['newest', 'popular', 'price_asc']).default('newest'),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const { page, limit, sort, isSingle } = query.data;
    const skip = (page - 1) * limit;
    const orderBy: any = sort === 'popular' ? { plays: 'desc' } : sort === 'price_asc' ? { price: 'asc' } : { createdAt: 'desc' };

    const where: any = { artistId: id, status: 'ACTIVE' };
    if (isSingle) where.albumId = null;

    const [total, tracks] = await Promise.all([
      prisma.track.count({ where }),
      prisma.track.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          album: { select: { id: true, title: true, coverUrl: true } },
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
   * GET /api/v1/artists/:id/albums
   * Get artist albums with their tracks
   */
  fastify.get('/:id/albums', async (request, reply) => {
    const { id } = request.params as { id: string };

    const albums = await prisma.album.findMany({
      where: { artistId: id, status: 'ACTIVE' },
      orderBy: { releaseDate: 'desc' },
      include: {
        tracks: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, coverUrl: true, duration: true, price: true, plays: true },
        },
        _count: { select: { tracks: true, purchases: true } },
      },
    });

    return reply.send({ success: true, data: albums });
  });

  /**
   * GET /api/v1/artists/:id/videos
   * Get artist videos, filterable by type (CLIP or SHORT)
   */
  fastify.get('/:id/videos', async (request, reply) => {
    const { id } = request.params as { id: string };
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
      type: z.enum(['CLIP', 'SHORT']).optional(),
    });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const { page, limit, type } = query.data;
    const skip = (page - 1) * limit;
    const where: any = { artistId: id, status: 'ACTIVE' };
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
   * POST /api/v1/artists/:id/follow
   * Follow an artist (transactional with affinity boost & rate limiting)
   */
  fastify.post('/:id/follow', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const artist = await prisma.artistProfile.findUnique({ where: { id } });
    if (!artist) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });

    try {
      await prisma.$transaction([
        prisma.follow.create({ data: { userId: user.userId, artistId: id } }),
        prisma.artistProfile.update({
          where: { id },
          data: { totalFollowers: { increment: 1 } },
        }),
        prisma.userArtistAffinity.upsert({
          where: { userId_artistId: { userId: user.userId, artistId: id } },
          create: { userId: user.userId, artistId: id, score: 10 },
          update: { score: { increment: 10 } },
        }),
      ]);
      
      // Notify the artist in real-time
      publishUserUpdate(artist.userId, { 
        type: 'NEW_FOLLOWER', 
        followerId: user.userId,
        artistId: id 
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Already following — idempotent response
        return reply.send({ success: true, data: { following: true } });
      }
      throw err;
    }

    return reply.send({ success: true, data: { following: true } });
  });

  /**
   * DELETE /api/v1/artists/:id/follow
   * Unfollow an artist (transactional & rate limited)
   */
  fastify.delete('/:id/follow', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const follow = await prisma.follow.findUnique({
      where: { userId_artistId: { userId: user.userId, artistId: id } }
    });

    if (follow) {
      await prisma.$transaction([
        prisma.follow.delete({ where: { id: follow.id } }),
        prisma.artistProfile.update({
          where: { id },
          data: { totalFollowers: { decrement: 1 } },
        }),
      ]);
    }

    return reply.send({ success: true, data: { following: false } });
  });

  /**
   * PATCH /api/v1/artists/:id/notifications
   * Update notification preferences for a followed artist
   */
  fastify.patch('/:id/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    
    const schema = z.object({
      notifyAll: z.boolean().optional(),
      notifyAlbums: z.boolean().optional(),
      notifyTracks: z.boolean().optional(),
      notifyVideos: z.boolean().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: { message: 'Invalid input' } });

    const follow = await prisma.follow.findUnique({
      where: { userId_artistId: { userId: user.userId, artistId: id } },
    });

    if (!follow) return reply.status(404).send({ success: false, error: { message: 'You are not following this artist' } });

    const updated = await prisma.follow.update({
      where: { id: follow.id },
      data: parsed.data,
    });

    return reply.send({ success: true, data: updated });
  });

  /**
   * GET /api/v1/artists/:id/follow-status
   * Get follow status for the current user
   */
  fastify.get('/:id/follow-status', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const follow = await prisma.follow.findUnique({
      where: { userId_artistId: { userId: user.userId, artistId: id } },
    });

    return reply.send({ success: true, data: { isFollowing: !!follow, follow } });
  });
}

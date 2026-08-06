import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '@kephale/database';
import jwt from 'jsonwebtoken';
import { authenticate, requireArtist } from '../middleware/auth.js';
import { z } from 'zod';
import { addNotificationJob } from '../queues/index.js';

const CreateLiveSchema = z.object({
  title: z.string({ required_error: "Le titre est obligatoire" }).min(3, "Le titre doit faire au moins 3 caractères").max(100, "Le titre est trop long"),
  description: z.string().max(500, "La description est trop longue").optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  mode: z.enum(['VIDEO', 'AUDIO']).default('VIDEO'),
  allowGuests: z.boolean().default(true),
  maxGuests: z.number().min(0).max(50).default(5),
  duration: z.number().min(5).max(480).optional(),
});

const GiftSchema = z.object({
  tokens: z.number().int().min(1).max(10000),
  message: z.string().max(200).optional(),
});

export async function liveRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/v1/lives
   * Artist creates a new live session
   */
  fastify.post('/', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const user = request.user;
    const body = CreateLiveSchema.safeParse(request.body);
    if (!body.success) {
      const message = body.error.errors.map(e => e.message).join(', ');
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message } });
    }

    const artist = await prisma.artistProfile.findUnique({
      where: { userId: user.userId },
    });

    if (!artist) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const roomId = `live_${artist.id}_${Date.now()}`;

    // Si on veut lancer un live tout de suite, on vérifie qu'il n'y a pas déjà un live en cours
    if (!body.data.scheduledAt) {
      const activeLive = await prisma.live.findFirst({
        where: { artistId: artist.id, status: 'LIVE' },
      });
      if (activeLive) {
        return reply.status(400).send({ success: false, error: { code: 'ALREADY_LIVE', message: 'Vous avez déjà un live en cours.' } });
      }
    }

    const live = await prisma.live.create({
      data: {
        artistId: artist.id,
        title: body.data.title,
        description: body.data.description,
        roomId,
        status: 'SCHEDULED',
        mode: body.data.mode as any,
        allowGuests: body.data.allowGuests,
        maxGuests: body.data.maxGuests,
        duration: body.data.duration,
        scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : null,
      },
      include: {
        artist: {
          select: { id: true, stageName: true, avatar: true },
        },
      },
    });

    return reply.status(201).send({ success: true, data: live });
  });

  /**
   * POST /api/v1/lives/:id/start
   * Artist starts a live → get LiveKit publisher token
   */
  fastify.post('/:id/start', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const live = await prisma.live.findUnique({
      where: { id },
      include: { artist: true },
    });

    if (!live) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    if (live.artist.userId !== user.userId) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your live' } });

    if (live.status === 'LIVE') {
      // Allow reconnecting to an already live session, skip state change
    } else {
      // Check if they already have another active live
      const activeLive = await prisma.live.findFirst({
        where: { artistId: live.artistId, status: 'LIVE' },
      });
      if (activeLive) {
        return reply.status(400).send({ success: false, error: { code: 'ALREADY_LIVE', message: 'Vous avez déjà un live en cours.' } });
      }

      await prisma.live.update({
        where: { id },
        data: { status: 'LIVE', startedAt: new Date() },
      });
    }

    // Create LiveKit publisher token
    const token = jwt.sign(
      {
        sub: `artist_${user.userId}`,
        name: live.artist.stageName,
        video: { roomJoin: true, room: live.roomId, canPublish: true, canSubscribe: false },
      },
      process.env.LIVEKIT_API_SECRET || 'livekit_secret',
      {
        issuer: process.env.LIVEKIT_API_KEY || 'livekit_key',
        expiresIn: '6h',
      }
    );

    // 🔔 Notifier les followers que le live a démarré (asynchrone, non-bloquant)
    addNotificationJob({
      type: 'LIVE_STARTED',
      artistId: live.artistId,
      liveId: live.id,
      artistName: live.artist.stageName,
      liveTitle: live.title,
    }).catch(() => {});

    return reply.send({
      success: true,
      data: {
        liveToken: {
          token,
          serverUrl: process.env.LIVEKIT_SERVER_URL!,
          roomName: live.roomId,
        },
        live,
      },
    });
  });

  /**
   * POST /api/v1/lives/:id/join
   * Viewer joins a live → get LiveKit subscriber token
   */
  fastify.post('/:id/join', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const live = await prisma.live.findUnique({
      where: { id },
      include: { artist: { select: { id: true, userId: true, stageName: true, avatar: true } } },
    });

    if (!live || (live.status !== 'LIVE' && live.status !== 'SCHEDULED')) {
      return reply.status(404).send({ success: false, error: { code: 'LIVE_NOT_ACTIVE', message: 'Live is not active or scheduled' } });
    }

    if (live.status === 'SCHEDULED') {
      // Don't create a LiveKit room yet, just allow entering the "waiting room"
      return reply.send({
        success: true,
        data: { liveToken: null, live },
      });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true, avatar: true },
    });

    const isHost = live.artist.userId === user.userId;

    const token = jwt.sign(
      {
        sub: isHost ? `artist_${user.userId}` : `viewer_${user.userId}`,
        name: userData?.name || 'Anonyme',
        video: { roomJoin: true, room: live.roomId, canPublish: isHost, canSubscribe: true },
      },
      process.env.LIVEKIT_API_SECRET || 'livekit_secret',
      {
        issuer: process.env.LIVEKIT_API_KEY || 'livekit_key',
        expiresIn: '6h',
      }
    );

    // Le viewerCount est géré par Redis dans socket/index.ts (live:join / live:leave / disconnect)
    // Ne pas incrémenter ici pour éviter les doublons avec le compteur Redis

    return reply.send({
      success: true,
      data: {
        liveToken: { token, serverUrl: process.env.LIVEKIT_SERVER_URL!, roomName: live.roomId },
        live,
      },
    });
  });

  /**
   * POST /api/v1/lives/:id/end
   * Artist ends a live session
   */
  fastify.post('/:id/end', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const live = await prisma.live.findUnique({ where: { id }, include: { artist: true } });
    if (!live) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    if (live.artist.userId !== user.userId) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your live' } });

    const updatedLive = await prisma.live.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    // TODO: trigger BullMQ job to process donations payout and recording

    return reply.send({ success: true, data: updatedLive });
  });

  /**
   * DELETE /api/v1/lives/:id
   * Artist deletes a scheduled live
   */
  fastify.delete('/:id', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const live = await prisma.live.findUnique({ where: { id }, include: { artist: true } });
    if (!live) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    if (live.artist.userId !== user.userId) return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Not your live' } });
    if (live.status !== 'SCHEDULED') return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Only scheduled lives can be deleted' } });

    await prisma.live.delete({ where: { id } });

    return reply.send({ success: true, message: 'Live deleted' });
  });

  /**
   * POST /api/v1/lives/:id/like
   * Increment likes for a live (TikTok style)
   */
  fastify.post('/:id/like', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const live = await prisma.live.update({
      where: { id },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    });
    return reply.send({ success: true, data: { likesCount: live.likesCount } });
  });

  /**
   * POST /api/v1/lives/:id/gift — DÉSACTIVÉ
   *
   * ⚠️  Les dons en direct se font UNIQUEMENT via Socket.IO (event 'live:donate').
   *     Cette route REST a été désactivée pour éviter un double débit de tokens
   *     (double chemin REST + Socket.IO → double transaction possible).
   *
   *     Côté mobile : utiliser socket.emit('live:donate', { liveId, tokens, message })
   */
  fastify.post('/:id/gift', { preHandler: [authenticate] }, async (_request, reply) => {
    return reply.status(410).send({
      success: false,
      error: {
        code: 'GONE',
        message: 'Cette route est désactivée. Les dons se font via Socket.IO (event: live:donate).',
      },
    });
  });

  /**
   * POST /api/v1/lives/:id/report
   * Report a live stream
   */
  fastify.post('/:id/report', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    const { reason } = request.body as { reason: string };

    await prisma.liveReport.create({
      data: { liveId: id, userId: user.userId, reason },
    });
    return reply.send({ success: true, data: { success: true } });
  });

  /**
   * POST /api/v1/lives/:id/participants/request
   * Viewer requests to join
   */
  fastify.post('/:id/participants/request', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const live = await prisma.live.findUnique({ where: { id } });
    if (!live || !live.allowGuests) return reply.status(400).send({ success: false, error: { message: 'Guests not allowed' } });

    const participant = await prisma.liveParticipant.upsert({
      where: { liveId_userId: { liveId: id, userId: user.userId } },
      update: { status: 'PENDING' },
      create: { liveId: id, userId: user.userId, status: 'PENDING' },
    });
    return reply.send({ success: true, data: participant });
  });

  /**
   * POST /api/v1/lives/:id/participants/:userId/approve
   * Artist approves a guest
   */
  fastify.post('/:id/participants/:userId/approve', { preHandler: [authenticate, requireArtist] }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    
    // In a real app we check if current user is the artist of this live
    const participant = await prisma.liveParticipant.update({
      where: { liveId_userId: { liveId: id, userId } },
      data: { status: 'ACCEPTED' },
    });
    return reply.send({ success: true, data: participant });
  });

  /**
   * GET /api/v1/lives
   * List active and scheduled lives
   */
  fastify.get('/', async (request, reply) => {
    // If we want to sort by followed, we need to try decoding the token optionally.
    // For simplicity, we just return the active lives here and the frontend can sort them,
    // OR we decode the token if Authorization header is present.
    let userId: string | null = null;
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
      }
    } catch(_e) {}

    const QuerySchema = z.object({
      search: z.string().optional(),
    });
    const { search } = QuerySchema.parse(request.query || {});

    const where: any = { status: { in: ['LIVE', 'SCHEDULED'] } };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const lives = await prisma.live.findMany({
      where,
      take: 20,
      include: {
        artist: { 
          select: { 
            id: true, stageName: true, avatar: true, coverImage: true,
            followers: userId ? { where: { userId } } : false
          } 
        },
      },
    });

    // Custom sort: LIVE first, then FOLLOWED artists first
    lives.sort((a, b) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
      
      const aFollowed = a.artist.followers?.length > 0;
      const bFollowed = b.artist.followers?.length > 0;
      if (aFollowed && !bFollowed) return -1;
      if (bFollowed && !aFollowed) return 1;
      
      // Fallback: startedAt desc
      const aTime = a.startedAt?.getTime() || a.scheduledAt?.getTime() || 0;
      const bTime = b.startedAt?.getTime() || b.scheduledAt?.getTime() || 0;
      return bTime - aTime;
    });

    return reply.send({ success: true, data: lives });
  });
}

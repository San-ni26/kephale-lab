import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '@kephale/database';
import { redisSub, CHANNELS } from '../lib/redisPubSub.js';
import { redis } from '../lib/redis.js';
import { addNotificationJob } from '../queues/index.js';

interface AuthSocket extends Socket {
  userId?: string;
  userName?: string;
  userAvatar?: string;
}

export function setupSocketIO(io: SocketIOServer) {
  // ── Auth Middleware ──────────────────────────────────────────────────────────
  io.use(async (socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, name: true, avatar: true },
      });
      if (!user) return next(new Error('User not found'));

      socket.userId = user.id;
      socket.userName = user.name;
      socket.userAvatar = user.avatar || undefined;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Redis Pub/Sub Listener ───────────────────────────────────────────────────
  // We only subscribe once per Node process
  redisSub.subscribe(CHANNELS.USER_UPDATES)
    .then(() => console.log('✅ Subscribed to Redis user updates channel'))
    .catch(() => {
      // Redis indisponible / mode hors ligne
    });

  redisSub.on('message', (channel: string, message: string) => {
    if (channel === CHANNELS.USER_UPDATES) {
      try {
        const { userId, data } = JSON.parse(message);
        if (userId) {
          // Push update to the specific user's personal room
          io.to(`user:${userId}`).emit('user:update', data);
        }
      } catch (err) {
        console.error('Error parsing Redis user update message:', err);
      }
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    console.log(`🔌 Socket connected: ${socket.userId}`);

    // Join personal user room for global real-time updates
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // ── Live Room Events ───────────────────────────────────────────────────────

    socket.on('live:join', async (liveId: string) => {
      if (!liveId || typeof liveId !== 'string') return;
      socket.join(`live:${liveId}`);

      // Incrémenter compteur viewers dans Redis (TTL 24h)
      const redisKey = `live:viewers:${liveId}`;
      const newCount = await redis.incr(redisKey);
      await redis.expire(redisKey, 86400);

      // Synchroniser en DB de façon non-bloquante (peak tracking)
      prisma.live.update({
        where: { id: liveId },
        data: { viewerCount: newCount },
      }).catch(() => {});

      // Broadcaster le nouveau compte aux participants
      io.to(`live:${liveId}`).emit('live:viewer_count', { count: newCount });
    });

    socket.on('live:leave', async (liveId: string) => {
      if (!liveId || typeof liveId !== 'string') return;
      socket.leave(`live:${liveId}`);

      const redisKey = `live:viewers:${liveId}`;
      const newCount = Math.max(0, await redis.decr(redisKey));
      if (newCount === 0) await redis.del(redisKey);

      io.to(`live:${liveId}`).emit('live:viewer_count', { count: newCount });
    });

    socket.on('live:chat', async ({ liveId, message }: { liveId: string; message: string }) => {
      if (!message?.trim() || !liveId || typeof liveId !== 'string') return;
      // Limiter la taille du message (sécurité)
      const trimmedMsg = message.trim().slice(0, 200);
      if (trimmedMsg.length === 0) return;

      // Persist to DB (non-blocking)
      prisma.liveChatMessage.create({
        data: {
          liveId,
          userId: socket.userId!,
          userName: socket.userName!,
          userAvatar: socket.userAvatar,
          message: message.trim().slice(0, 200),
        },
      }).catch(() => {});

      // Broadcast to all in room
      io.to(`live:${liveId}`).emit('live:chat_message', {
        id: `${Date.now()}_${socket.userId}`,
        liveId,
        userId: socket.userId,
        user: { id: socket.userId, name: socket.userName, avatar: socket.userAvatar },
        message: trimmedMsg,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('live:donate', async ({ liveId, tokens, message }: { liveId: string; tokens: number; message?: string }) => {
      if (!liveId || typeof liveId !== 'string' || typeof tokens !== 'number' || tokens <= 0 || tokens > 10000) {
        socket.emit('error', { code: 'INVALID_PARAMS', message: 'Paramètres invalides' });
        return;
      }

      try {
        // Check user has enough tokens
        const user = await prisma.user.findUnique({
          where: { id: socket.userId! },
          select: { tokenBalance: true },
        });

        if (!user || user.tokenBalance < tokens) {
          socket.emit('error', { code: 'INSUFFICIENT_TOKENS', message: 'Not enough tokens' });
          return;
        }

        // Fetch live to get artistId
        const live = await prisma.live.findUnique({ where: { id: liveId }, select: { artistId: true } });
        if (!live) return;

        // Deduct tokens and create donation atomically
        const [donation] = await prisma.$transaction([
          prisma.donation.create({
            data: { liveId, userId: socket.userId!, tokens, message },
          }),
          prisma.user.update({
            where: { id: socket.userId! },
            data: { tokenBalance: { decrement: tokens } },
          }),
          prisma.live.update({
            where: { id: liveId },
            data: { totalTokens: { increment: tokens } },
          }),
          prisma.artistProfile.update({
            where: { id: live.artistId },
            data: { 
              totalEarnings: { increment: Math.floor(tokens * 8) },
              pendingPayout: { increment: Math.floor(tokens * 8) }
            },
          }),
        ]);

        // Broadcast donation alert to all in room
        io.to(`live:${liveId}`).emit('live:donation', {
          id: donation.id,
          liveId,
          fromUserId: socket.userId,
          fromUser: { id: socket.userId, name: socket.userName, avatar: socket.userAvatar },
          tokens,
          message,
          createdAt: donation.createdAt.toISOString(),
        });

        // 🔔 Notifier l'artiste du don reçu (push notification)
        const liveWithArtist = await prisma.live.findUnique({
          where: { id: liveId },
          select: { artist: { select: { userId: true } } },
        });
        if (liveWithArtist?.artist.userId && liveWithArtist.artist.userId !== socket.userId) {
          addNotificationJob({
            type: 'DONATION_RECEIVED',
            artistUserId: liveWithArtist.artist.userId,
            fromUserName: socket.userName || 'Un spectateur',
            tokens,
            liveId,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Donation error:', err);
        socket.emit('error', { code: 'DONATION_FAILED', message: 'Donation failed' });
      }
    });

    socket.on('live:request_discussion', async (liveId: string) => {
      if (!liveId) return;

      try {
        const request = await prisma.discussionRequest.create({
          data: { liveId, userId: socket.userId!, status: 'PENDING' },
        });

        // Notify the artist (in the same live room)
        io.to(`live:${liveId}`).emit('live:discussion_request', {
          id: request.id,
          liveId,
          fromUserId: socket.userId,
          fromUser: { id: socket.userId, name: socket.userName, avatar: socket.userAvatar },
          status: 'PENDING',
          createdAt: request.createdAt.toISOString(),
        });
      } catch {
        socket.emit('error', { code: 'REQUEST_FAILED', message: 'Could not send discussion request' });
      }
    });

    socket.on('live:accept_discussion', async (requestId: string) => {
      try {
        const request = await prisma.discussionRequest.findUnique({
          where: { id: requestId },
          include: { live: { include: { artist: true } } },
        });

        if (!request || request.live.artist.userId !== socket.userId!) return;

        // Create private LiveKit room token for both parties
        // (Token generation is handled in the /lives/:id/discussion/:requestId/join route)
        const privateRoomId = `discussion_${requestId}`;

        await prisma.discussionRequest.update({
          where: { id: requestId },
          data: { status: 'ACCEPTED', roomId: privateRoomId },
        });

        // Notify the requesting viewer
        io.to(`live:${request.liveId}`).emit('live:discussion_accepted', {
          requestId,
          privateRoomId,
          // Frontend fetches the actual LiveKit token from the API
        });

        // 🔔 Push notification vers le spectateur accepté
        const artistStageName = request.live.artist.stageName ?? 'L\'artiste';
        addNotificationJob({
          type: 'DISCUSSION_ACCEPTED',
          viewerUserId: request.userId,
          artistName: artistStageName,
          liveId: request.liveId,
          privateRoomId,
        }).catch(() => {});
      } catch {
        socket.emit('error', { code: 'ACCEPT_FAILED', message: 'Could not accept discussion' });
      }
    });

    socket.on('live:reject_discussion', async (requestId: string) => {
      try {
        await prisma.discussionRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED' },
        });
      } catch {}
    });

    // ── Disconnect ───────────────────────────────────────────────────

    socket.on('disconnect', async () => {
      // Décrémenter les compteurs viewer pour tous les lives rejoints
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('live:'));
      for (const room of rooms) {
        const liveId = room.replace('live:', '');
        const redisKey = `live:viewers:${liveId}`;
        const exists = await redis.exists(redisKey);
        if (exists) {
          const newCount = Math.max(0, await redis.decr(redisKey));
          if (newCount === 0) await redis.del(redisKey);
          io.to(room).emit('live:viewer_count', { count: newCount });
        }
      }
    });
  });
}

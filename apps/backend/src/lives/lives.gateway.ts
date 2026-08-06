import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import * as jwt from 'jsonwebtoken';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

interface AuthSocket extends Socket {
  userId?: string;
  userName?: string;
  userAvatar?: string | null;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LivesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async handleConnection(client: AuthSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      client.userId = decoded.userId;

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { name: true, avatar: true },
      });

      if (user) {
        client.userName = user.name;
        client.userAvatar = user.avatar;
      }
    } catch {
      // Allow anonymous viewing connection if needed, or silent fail
    }
  }

  async handleDisconnect(client: AuthSocket) {
    const rooms = Array.from(client.rooms || []).filter((r) => r.startsWith('live:'));
    for (const room of rooms) {
      const liveId = room.replace('live:', '');
      const redisKey = `live:viewers:${liveId}`;
      const exists = await this.redis.exists(redisKey);
      if (exists) {
        const newCount = Math.max(0, await this.redis.decr(redisKey));
        if (newCount === 0) await this.redis.del(redisKey);
        this.server.to(room).emit('live:viewer_count', { count: newCount });
      }
    }
  }

  @SubscribeMessage('live:join')
  async handleJoinLive(@ConnectedSocket() client: AuthSocket, @MessageBody() liveId: string) {
    if (!liveId) return;

    client.join(`live:${liveId}`);

    const redisKey = `live:viewers:${liveId}`;
    const count = await this.redis.incr(redisKey);
    this.server.to(`live:${liveId}`).emit('live:viewer_count', { count });

    // Fetch and send last 20 messages to the user
    const history = await this.prisma.liveChatMessage.findMany({
      where: { liveId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    client.emit('live:chat_history', history.reverse());
  }

  @SubscribeMessage('live:leave')
  async handleLeaveLive(@ConnectedSocket() client: AuthSocket, @MessageBody() liveId: string) {
    if (!liveId) return;

    client.leave(`live:${liveId}`);

    const redisKey = `live:viewers:${liveId}`;
    const exists = await this.redis.exists(redisKey);
    if (exists) {
      const count = Math.max(0, await this.redis.decr(redisKey));
      if (count === 0) await this.redis.del(redisKey);
      this.server.to(`live:${liveId}`).emit('live:viewer_count', { count });
    }
  }

  @SubscribeMessage('live:chat')
  async handleLiveChat(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { liveId: string; message: string }
  ) {
    if (!client.userId || !data.liveId || !data.message?.trim()) return;

    try {
      const chatMessage = await this.prisma.liveChatMessage.create({
        data: {
          liveId: data.liveId,
          userId: client.userId,
          userName: client.userName || 'Spectateur',
          userAvatar: client.userAvatar,
          message: data.message.trim(),
        },
      });

      this.server.to(`live:${data.liveId}`).emit('live:chat_message', {
        id: chatMessage.id,
        liveId: data.liveId,
        user: { id: client.userId, name: client.userName, avatar: client.userAvatar },
        message: chatMessage.message,
        createdAt: chatMessage.createdAt.toISOString(),
      });
    } catch {
      client.emit('error', { code: 'CHAT_FAILED', message: 'Failed to post message' });
    }
  }

  @SubscribeMessage('live:donate')
  async handleLiveDonate(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() data: { liveId: string; tokens: number; message?: string }
  ) {
    if (!client.userId) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Must be logged in to donate' });
      return;
    }

    const { liveId, tokens, message } = data;
    if (!liveId || !tokens || tokens < 1) {
      client.emit('error', { code: 'INVALID_DATA', message: 'Invalid donation data' });
      return;
    }

    try {
      const live = await this.prisma.live.findUnique({
        where: { id: liveId },
        include: { artist: true },
      });

      if (!live || live.status !== 'LIVE') {
        client.emit('error', { code: 'LIVE_NOT_ACTIVE', message: 'Live is not active' });
        return;
      }

      const user = await this.prisma.user.findUnique({ where: { id: client.userId } });
      if (!user || user.tokenBalance < tokens) {
        client.emit('error', { code: 'INSUFFICIENT_TOKENS', message: 'Solde de jetons insuffisant' });
        return;
      }

      const [donation] = await this.prisma.$transaction([
        this.prisma.donation.create({
          data: { liveId, userId: client.userId, tokens, message },
        }),
        this.prisma.user.update({
          where: { id: client.userId },
          data: { tokenBalance: { decrement: tokens } },
        }),
        this.prisma.live.update({
          where: { id: liveId },
          data: { totalTokens: { increment: tokens } },
        }),
        this.prisma.artistProfile.update({
          where: { id: live.artistId },
          data: {
            totalEarnings: { increment: Math.floor(tokens * 8) },
            pendingPayout: { increment: Math.floor(tokens * 8) },
          },
        }),
      ]);

      this.server.to(`live:${liveId}`).emit('live:donation', {
        id: donation.id,
        liveId,
        fromUserId: client.userId,
        fromUser: { id: client.userId, name: client.userName, avatar: client.userAvatar },
        tokens,
        message,
        createdAt: donation.createdAt.toISOString(),
      });

      // Notification BullMQ pour l'artiste
      if (live.artist.userId && live.artist.userId !== client.userId) {
        this.notificationsQueue.add('send-notification', {
          type: 'DONATION_RECEIVED',
          artistUserId: live.artist.userId,
          fromUserName: client.userName || 'Un spectateur',
          tokens,
          liveId,
        }).catch(() => {});
      }
    } catch {
      client.emit('error', { code: 'DONATION_FAILED', message: 'Donation failed' });
    }
  }

  @SubscribeMessage('live:request_discussion')
  async handleRequestDiscussion(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() liveId: string
  ) {
    if (!client.userId || !liveId) return;

    try {
      const request = await this.prisma.discussionRequest.create({
        data: { liveId, userId: client.userId, status: 'PENDING' },
      });

      this.server.to(`live:${liveId}`).emit('live:discussion_request', {
        id: request.id,
        liveId,
        fromUserId: client.userId,
        fromUser: { id: client.userId, name: client.userName, avatar: client.userAvatar },
        status: 'PENDING',
        createdAt: request.createdAt.toISOString(),
      });
    } catch {
      client.emit('error', { code: 'REQUEST_FAILED', message: 'Could not send discussion request' });
    }
  }

  @SubscribeMessage('live:accept_discussion')
  async handleAcceptDiscussion(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() requestId: string
  ) {
    if (!client.userId || !requestId) return;

    try {
      const request = await this.prisma.discussionRequest.findUnique({
        where: { id: requestId },
        include: { live: { include: { artist: true } } },
      });

      if (!request || request.live.artist.userId !== client.userId) return;

      const privateRoomId = `discussion_${requestId}`;

      await this.prisma.discussionRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED', roomId: privateRoomId },
      });

      this.server.to(`live:${request.liveId}`).emit('live:discussion_accepted', {
        requestId,
        privateRoomId,
      });

      const artistStageName = request.live.artist.stageName ?? "L'artiste";
      this.notificationsQueue.add('send-notification', {
        type: 'DISCUSSION_ACCEPTED',
        viewerUserId: request.userId,
        artistName: artistStageName,
        liveId: request.liveId,
        privateRoomId,
      }).catch(() => {});
    } catch {
      client.emit('error', { code: 'ACCEPT_FAILED', message: 'Could not accept discussion' });
    }
  }

  @SubscribeMessage('live:reject_discussion')
  async handleRejectDiscussion(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() requestId: string
  ) {
    if (!client.userId || !requestId) return;

    try {
      await this.prisma.discussionRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      });
    } catch {}
  }
}

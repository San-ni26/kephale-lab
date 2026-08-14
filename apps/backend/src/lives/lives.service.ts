import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CurrencyService } from '../payments/currency.service';

function generateLiveKitToken(options: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
}): string {
  const payload = {
    video: {
      roomJoin: true,
      room: options.room,
      canPublish: options.canPublish,
      canSubscribe: options.canSubscribe,
    },
    name: options.name || 'User',
  };
  return jwt.sign(payload, options.apiSecret, {
    algorithm: 'HS256',
    issuer: options.apiKey,
    subject: options.identity,
    expiresIn: '6h',
    notBefore: 0,
  });
}

@Injectable()
export class LivesService {
  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly currencyService: CurrencyService,
  ) {}

  async createLive(userId: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({
      where: { userId },
    });

    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const roomId = `live_${artist.id}_${Date.now()}`;

    if (!data.scheduledAt) {
      const activeLive = await this.prisma.live.findFirst({
        where: { artistId: artist.id, status: 'LIVE' },
      });
      if (activeLive) {
        throw new BadRequestException({ success: false, error: { code: 'ALREADY_LIVE', message: 'Vous avez déjà un live en cours.' } });
      }
    }

    const live = await this.prisma.live.create({
      data: {
        artistId: artist.id,
        title: data.title,
        description: data.description,
        roomId,
        status: 'SCHEDULED',
        mode: data.mode,
        allowGuests: data.allowGuests,
        maxGuests: data.maxGuests,
        duration: data.duration,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      },
      include: {
        artist: {
          select: { id: true, stageName: true, avatar: true },
        },
      },
    });

    return live;
  }

  async startLive(userId: string, liveId: string) {
    const live = await this.prisma.live.findUnique({
      where: { id: liveId },
      include: { artist: true },
    });

    if (!live) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    }

    if (live.artist.userId !== userId) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
    }

    if (live.status !== 'LIVE') {
      const activeLive = await this.prisma.live.findFirst({
        where: { artistId: live.artistId, status: 'LIVE', id: { not: liveId } },
      });
      if (activeLive) {
        throw new BadRequestException({ success: false, error: { code: 'ALREADY_LIVE', message: 'Vous avez déjà un autre live en cours.' } });
      }

      await this.prisma.live.update({
        where: { id: liveId },
        data: { status: 'LIVE', startedAt: new Date() },
      });
    }

    const token = generateLiveKitToken({
      apiKey: process.env.LIVEKIT_API_KEY || 'default_key',
      apiSecret: process.env.LIVEKIT_API_SECRET || 'default_secret',
      identity: `artist_${userId}`,
      name: live.artist.stageName,
      room: live.roomId,
      canPublish: true,
      canSubscribe: false,
    });

    this.notificationsQueue.add('send-notification', {
      type: 'LIVE_STARTED',
      artistId: live.artistId,
      liveId: live.id,
      artistName: live.artist.stageName,
      liveTitle: live.title,
    }).catch(() => {});

    return {
      liveToken: {
        token,
        serverUrl: process.env.LIVEKIT_SERVER_URL!,
        roomName: live.roomId,
      },
      live,
    };
  }

  async joinLive(userId: string, liveId: string) {
    const live = await this.prisma.live.findUnique({
      where: { id: liveId },
      include: { artist: { select: { id: true, userId: true, stageName: true, avatar: true } } },
    });

    if (!live || (live.status !== 'LIVE' && live.status !== 'SCHEDULED')) {
      throw new NotFoundException({ success: false, error: { code: 'LIVE_NOT_ACTIVE', message: 'Live is not active or scheduled' } });
    }

    if (live.status === 'SCHEDULED') {
      return { liveToken: null, live };
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatar: true },
    });

    const isHost = live.artist.userId === userId;

    const token = generateLiveKitToken({
      apiKey: process.env.LIVEKIT_API_KEY || 'default_key',
      apiSecret: process.env.LIVEKIT_API_SECRET || 'default_secret',
      identity: isHost ? `artist_${userId}` : `viewer_${userId}`,
      name: userData?.name || 'Anonyme',
      room: live.roomId,
      canPublish: isHost,
      canSubscribe: true,
    });

    return {
      liveToken: { token, serverUrl: process.env.LIVEKIT_SERVER_URL!, roomName: live.roomId },
      live,
    };
  }

  async endLive(userId: string, liveId: string) {
    const live = await this.prisma.live.findUnique({ where: { id: liveId }, include: { artist: true } });
    if (!live) throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    if (live.artist.userId !== userId) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your live' } });

    const updatedLive = await this.prisma.live.update({
      where: { id: liveId },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    return updatedLive;
  }

  async deleteLive(userId: string, liveId: string) {
    const live = await this.prisma.live.findUnique({ where: { id: liveId }, include: { artist: true } });
    if (!live) throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Live not found' } });
    if (live.artist.userId !== userId) throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your live' } });
    if (live.status !== 'SCHEDULED') throw new BadRequestException({ success: false, error: { code: 'BAD_REQUEST', message: 'Only scheduled lives can be deleted' } });

    await this.prisma.live.delete({ where: { id: liveId } });
  }

  async likeLive(liveId: string) {
    const live = await this.prisma.live.update({
      where: { id: liveId },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    });
    return { likesCount: live.likesCount };
  }

  async reportLive(userId: string, liveId: string, reason: string) {
    await this.prisma.liveReport.create({
      data: { liveId, userId, reason },
    });
    return { success: true };
  }

  async requestParticipant(userId: string, liveId: string) {
    const live = await this.prisma.live.findUnique({ where: { id: liveId } });
    if (!live || !live.allowGuests) throw new BadRequestException({ success: false, error: { message: 'Guests not allowed' } });

    const participant = await this.prisma.liveParticipant.upsert({
      where: { liveId_userId: { liveId, userId } },
      update: { status: 'PENDING' },
      create: { liveId, userId, status: 'PENDING' },
    });
    return participant;
  }

  async approveParticipant(userId: string, liveId: string, guestUserId: string) {
    const participant = await this.prisma.liveParticipant.update({
      where: { liveId_userId: { liveId, userId: guestUserId } },
      data: { status: 'ACCEPTED' },
    });
    return participant;
  }

  async getLives(userId: string | null, search?: string) {
    const where: any = { status: { in: ['LIVE', 'SCHEDULED'] } };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const lives = await this.prisma.live.findMany({
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

    lives.sort((a: any, b: any) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
      
      const aFollowed = a.artist.followers?.length > 0;
      const bFollowed = b.artist.followers?.length > 0;
      if (aFollowed && !bFollowed) return -1;
      if (bFollowed && !aFollowed) return 1;
      
      const aTime = a.startedAt?.getTime() || a.scheduledAt?.getTime() || 0;
      const bTime = b.startedAt?.getTime() || b.scheduledAt?.getTime() || 0;
      return bTime - aTime;
    });

    return lives;
  }
}

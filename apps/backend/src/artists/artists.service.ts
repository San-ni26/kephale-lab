import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role } from '@prisma/client';
import { Redis } from 'ioredis';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class ArtistsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private publishUserUpdate(userId: string, data: any) {
    const channel = `user:${userId}:updates`;
    this.redis.publish(channel, JSON.stringify(data)).catch(() => {});
  }

  private generateTokens(userId: string, role: string) {
    const accessToken = jwt.sign(
      { userId, role },
      this.configService.get<string>('JWT_SECRET')!,
      { expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any }
    );
    const refreshToken = jwt.sign(
      { userId, role },
      this.configService.get<string>('JWT_REFRESH_SECRET')!,
      { expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d') as any }
    );
    return { accessToken, refreshToken };
  }

  async createProfile(userId: string, data: any) {
    const existing = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new BadRequestException({ success: false, error: { code: 'ALREADY_EXISTS', message: 'User already has an artist profile' } });
    }

    const existingName = await this.prisma.artistProfile.findUnique({
      where: { stageName: data.stageName },
    });
    if (existingName) {
      throw new BadRequestException({ success: false, error: { code: 'STAGENAME_TAKEN', message: 'Ce nom de scène est déjà utilisé' } });
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      const newProfile = await tx.artistProfile.create({
        data: {
          userId,
          stageName: data.stageName,
          bio: data.bio,
          genre: data.genre || [],
          country: data.country || 'ML',
          avatar: data.avatar,
          coverImage: data.coverImage,
          websiteUrl: data.websiteUrl,
          instagramUrl: data.instagramUrl,
          twitterUrl: data.twitterUrl,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          role: Role.ARTIST,
          name: data.stageName,
          ...(data.avatar ? { avatar: data.avatar } : {}),
        },
      });

      return newProfile;
    });

    const tokens = this.generateTokens(userId, Role.ARTIST);

    return {
      profile,
      tokens,
    };
  }

  async updateOwnProfile(userId: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    if (data.stageName && data.stageName !== artist.stageName) {
      const existingName = await this.prisma.artistProfile.findUnique({
        where: { stageName: data.stageName },
      });
      if (existingName) {
        throw new BadRequestException({ success: false, error: { code: 'STAGENAME_TAKEN', message: 'Ce nom de scène est déjà utilisé' } });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedArtist = await tx.artistProfile.update({
        where: { id: artist.id },
        data,
        include: { _count: { select: { followers: true, tracks: true, videos: true, albums: true } } },
      });

      if (data.stageName || data.avatar) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(data.stageName ? { name: data.stageName } : {}),
            ...(data.avatar ? { avatar: data.avatar } : {}),
          },
        });
      }

      return updatedArtist;
    });

    return updated;
  }

  async getDashboard(userId: string) {
    const artist = await this.prisma.artistProfile.findUnique({
      where: { userId },
      include: {
        _count: {
          select: { followers: true, tracks: true, videos: true, albums: true },
        },
      },
    });

    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const [playsAgg, viewsAgg, revenueAgg, recentPurchases, topTracks, recentTracks, recentVideos] = await Promise.all([
      this.prisma.track.aggregate({
        where: { artistId: artist.id, status: 'ACTIVE' },
        _sum: { plays: true },
      }),
      this.prisma.video.aggregate({
        where: { artistId: artist.id, status: 'ACTIVE' },
        _sum: { views: true },
      }),
      this.prisma.purchase.aggregate({
        where: {
          OR: [
            { track: { artistId: artist.id } },
            { album: { artistId: artist.id } },
            { video: { artistId: artist.id } },
          ],
          status: 'SUCCEEDED',
        },
        _sum: { artistAmount: true },
      }),
      this.prisma.purchase.findMany({
        where: {
          OR: [
            { track: { artistId: artist.id } },
            { album: { artistId: artist.id } },
            { video: { artistId: artist.id } },
          ],
          status: 'SUCCEEDED',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          track: { select: { id: true, title: true, coverUrl: true } },
          album: { select: { id: true, title: true, coverUrl: true } },
          video: { select: { id: true, title: true, thumbnailUrl: true } },
          user: { select: { id: true, name: true, avatar: true } },
        },
      }),
      this.prisma.track.findMany({
        where: { artistId: artist.id, status: 'ACTIVE' },
        orderBy: { plays: 'desc' },
        take: 5,
        select: { id: true, title: true, coverUrl: true, plays: true, price: true },
      }),
      this.prisma.track.findMany({
        where: { artistId: artist.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, coverUrl: true, status: true, plays: true, createdAt: true },
      }),
      this.prisma.video.findMany({
        where: { artistId: artist.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, thumbnailUrl: true, type: true, status: true, views: true, createdAt: true },
      }),
    ]);

    return {
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
    };
  }

  async getSales(userId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { message: 'Artist not found' } });
    }

    const sales = await this.prisma.purchase.findMany({
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

    return sales;
  }

  async getWithdrawals(userId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { message: 'Artist not found' } });
    }

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
    });

    return withdrawals;
  }

  /**
   * Generate and send a 6-digit OTP code to authorize withdrawal
   */
  async requestWithdrawalOtp(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { artistProfile: true },
    });

    if (!user || !user.artistProfile) {
      throw new NotFoundException({ success: false, error: { message: 'Profil artiste introuvable' } });
    }

    // Generate random 6-digit OTP
    const crypto = require('crypto');
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpKey = `withdrawal:otp:${userId}`;

    // Store OTP in Redis with 10-minute TTL and max 3 attempts
    await this.redis.set(
      otpKey,
      JSON.stringify({ code: otp, attempts: 0, createdAt: Date.now() }),
      'EX',
      600
    );

    // In a production environment, send via Email (Resend/SendGrid) or SMS (Twilio)
    console.log(`[SECURITY] OTP de retrait généré pour ${user.email} (${user.artistProfile.stageName}): ${otp}`);

    return {
      success: true,
      message: `Code de validation envoyé à ${user.email.replace(/(.{2})(.*)(?=@)/, '$1***')}`,
      expiresInSeconds: 600,
    };
  }

  async requestWithdrawal(
    userId: string,
    data: { amount: number; paymentMethod: string; paymentDetails: string; otpCode?: string }
  ) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { message: 'Artist not found' } });
    }

    // ── Security: Verify OTP Code if OTP system is active ────────────────────
    const otpKey = `withdrawal:otp:${userId}`;
    const rawOtp = await this.redis.get(otpKey);

    if (rawOtp) {
      const otpData = JSON.parse(rawOtp);
      if (!data.otpCode || data.otpCode.trim() !== otpData.code) {
        otpData.attempts = (otpData.attempts || 0) + 1;
        if (otpData.attempts >= 3) {
          await this.redis.del(otpKey);
          throw new BadRequestException({
            success: false,
            error: { message: 'Trop de tentatives erronées. Veuillez demander un nouveau code.' },
          });
        }
        await this.redis.set(otpKey, JSON.stringify(otpData), 'KEEPTTL');
        throw new BadRequestException({
          success: false,
          error: { message: `Code de validation invalide (${3 - otpData.attempts} tentative(s) restante(s)).` },
        });
      }
      // OTP is valid -> delete after use
      await this.redis.del(otpKey);
    }

    const revenueAgg = await this.prisma.purchase.aggregate({
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

    const previousWithdrawalsAgg = await this.prisma.withdrawal.aggregate({
      where: { artistId: artist.id, status: { in: ['COMPLETED', 'PROCESSING', 'PENDING'] } },
      _sum: { amount: true },
    });
    const totalWithdrawnOrPending = previousWithdrawalsAgg._sum.amount || 0;

    const availableBalance = trueTotalEarnings - totalWithdrawnOrPending;

    if (data.amount > availableBalance) {
      throw new BadRequestException({ success: false, error: { message: 'Solde insuffisant' } });
    }

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          artistId: artist.id,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          paymentDetails: data.paymentDetails,
        },
      });

      await tx.artistProfile.update({
        where: { id: artist.id },
        data: { pendingPayout: { increment: data.amount } },
      });

      return w;
    });

    return withdrawal;
  }

  async cancelWithdrawal(userId: string, withdrawalId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { message: 'Artist not found' } });
    }

    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId, artistId: artist.id },
    });

    if (!withdrawal) {
      throw new NotFoundException({ success: false, error: { message: 'Retrait introuvable' } });
    }

    if (withdrawal.status !== 'PENDING') {
      throw new BadRequestException({ success: false, error: { message: 'Seuls les retraits en attente peuvent être annulés' } });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawal.delete({ where: { id: withdrawalId } });

      await tx.artistProfile.update({
        where: { id: artist.id },
        data: { pendingPayout: { decrement: withdrawal.amount } },
      });
    });

    return null;
  }

  async getArtists(query: any) {
    const { page = 1, limit = 20, search, genre } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (genre) where.genre = { has: genre };
    if (search) where.stageName = { contains: search, mode: 'insensitive' };

    const [total, artists] = await Promise.all([
      this.prisma.artistProfile.count({ where }),
      this.prisma.artistProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { totalFollowers: 'desc' },
        include: { _count: { select: { followers: true, tracks: true, albums: true } } },
      }),
    ]);

    return {
      data: artists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getArtistById(id: string) {
    const artist = await this.prisma.artistProfile.findUnique({
      where: { id },
      include: {
        _count: { select: { followers: true, tracks: true, videos: true, albums: true } },
      },
    });

    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });
    }

    return artist;
  }

  async getArtistStats(id: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { id } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });
    }

    const [followersCount, tracksCount, videosCount, albumsCount, playsAgg, viewsAgg] = await Promise.all([
      this.prisma.follow.count({ where: { artistId: id } }),
      this.prisma.track.count({ where: { artistId: id, status: 'ACTIVE' } }),
      this.prisma.video.count({ where: { artistId: id, status: 'ACTIVE' } }),
      this.prisma.album.count({ where: { artistId: id, status: 'ACTIVE' } }),
      this.prisma.track.aggregate({ where: { artistId: id, status: 'ACTIVE' }, _sum: { plays: true } }),
      this.prisma.video.aggregate({ where: { artistId: id, status: 'ACTIVE' }, _sum: { views: true } }),
    ]);

    return {
      followersCount,
      tracksCount,
      videosCount,
      albumsCount,
      totalPlays: playsAgg._sum.plays ?? 0,
      totalViews: viewsAgg._sum.views ?? 0,
    };
  }

  async getArtistTracks(id: string, query: any) {
    const { page = 1, limit = 20, sort = 'newest', isSingle } = query;
    const skip = (page - 1) * limit;

    const orderBy: any =
      sort === 'popular' ? { plays: 'desc' }
      : sort === 'price_asc' ? { price: 'asc' }
      : { createdAt: 'desc' };

    const where: any = { artistId: id, status: { not: 'INACTIVE' } };
    if (isSingle === true) {
      where.albumId = null;
    } else if (isSingle === false) {
      where.albumId = { not: null };
    }

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
          album: { select: { id: true, title: true, coverUrl: true } },
          _count: { select: { likes: true, purchases: true } },
        },
      }),
    ]);

    return {
      data: tracks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getArtistAlbums(id: string) {
    const albums = await this.prisma.album.findMany({
      where: { artistId: id, status: 'ACTIVE' },
      orderBy: { releaseDate: 'desc' },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, coverImage: true, isVerified: true } },
        tracks: {
          where: { status: { not: 'INACTIVE' } },
          orderBy: { createdAt: 'asc' },
          include: {
            artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
            _count: { select: { likes: true, purchases: true } },
          },
        },
        _count: { select: { tracks: true, purchases: true } },
      },
    });

    return albums;
  }

  async getArtistVideos(id: string, query: any) {
    const { page = 1, limit = 20, type } = query;
    const skip = (page - 1) * limit;

    const where: any = { artistId: id, status: 'ACTIVE' };
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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async followArtist(userId: string, artistId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { id: artistId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });
    }

    try {
      await this.prisma.$transaction([
        this.prisma.follow.create({ data: { userId, artistId } }),
        this.prisma.artistProfile.update({
          where: { id: artistId },
          data: { totalFollowers: { increment: 1 } },
        }),
        this.prisma.userArtistAffinity.upsert({
          where: { userId_artistId: { userId, artistId } },
          create: { userId, artistId, score: 10 },
          update: { score: { increment: 10 } },
        }),
      ]);

      this.publishUserUpdate(artist.userId, {
        type: 'NEW_FOLLOWER',
        followerId: userId,
        artistId,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return { following: true };
      }
      throw err;
    }

    return { following: true };
  }

  async unfollowArtist(userId: string, artistId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });

    if (follow) {
      await this.prisma.$transaction([
        this.prisma.follow.delete({ where: { id: follow.id } }),
        this.prisma.artistProfile.update({
          where: { id: artistId },
          data: { totalFollowers: { decrement: 1 } },
        }),
      ]);
    }

    return { following: false };
  }

  async getFollowStatus(userId: string, artistId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });

    return { isFollowing: !!follow, follow };
  }

  async updateNotifications(userId: string, artistId: string, data: any) {
    const follow = await this.prisma.follow.findUnique({
      where: { userId_artistId: { userId, artistId } },
    });

    if (!follow) {
      throw new NotFoundException({ success: false, error: { message: 'You are not following this artist' } });
    }

    const updated = await this.prisma.follow.update({
      where: { id: follow.id },
      data,
    });

    return updated;
  }
}

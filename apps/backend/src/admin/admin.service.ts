import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../redis/cache.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { Redis } from 'ioredis';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly cacheService: CacheService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // STATS GLOBALES
  // ─────────────────────────────────────────────────────────────────────────

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalUsers, totalArtists, totalTracks, totalAlbums, totalVideos,
      newUsersThisMonth, newUsersLastMonth,
      activeSubscriptions, pendingWithdrawals, pendingCopyrightReports,
      suspendedUsers, totalLives, totalPosts,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      this.prisma.artistProfile.count({ where: { isActive: true } }),
      this.prisma.track.count(),
      this.prisma.album.count(),
      this.prisma.video.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE', tier: { not: 'FREE' } } }),
      this.prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      this.prisma.copyrightReport.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.live.count(),
      this.prisma.post.count(),
    ]);

    const [revenueAggr, revenueLastMonth] = await Promise.all([
      this.prisma.purchase.aggregate({
        _sum: { platformFeeAmount: true },
        where: { status: 'SUCCEEDED', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.purchase.aggregate({
        _sum: { platformFeeAmount: true },
        where: { status: 'SUCCEEDED', createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      }),
    ]);

    const revenueThisMonth = revenueAggr._sum.platformFeeAmount || 0;
    const revenuePrevMonth = revenueLastMonth._sum.platformFeeAmount || 0;
    const revenueGrowth = revenuePrevMonth > 0
      ? ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100
      : 0;
    const userGrowth = newUsersLastMonth > 0
      ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100
      : 0;

    return {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth, growth: +revenueGrowth.toFixed(1), suspended: suspendedUsers, userGrowth: +userGrowth.toFixed(1) },
      artists: { total: totalArtists, pendingWithdrawals },
      content: { tracks: totalTracks, albums: totalAlbums, videos: totalVideos, lives: totalLives, posts: totalPosts },
      finance: { revenueThisMonthFcfa: revenueThisMonth, revenueGrowthPct: +revenueGrowth.toFixed(1), activeSubscriptions },
      moderation: { pendingCopyrightReports },
    };
  }

  async getGrowthStats(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [usersByDay, revenueByDay] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; count: number }[]>`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "User"
        WHERE "createdAt" >= ${since}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
      this.prisma.$queryRaw<{ date: string; total: number }[]>`
        SELECT DATE("createdAt") as date, SUM("platformFeeAmount")::float as total
        FROM "Purchase"
        WHERE "createdAt" >= ${since} AND status = 'SUCCEEDED'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);
    return { usersByDay, revenueByDay };
  }

  async getTopContent() {
    const [topTracks, topArtists, topVideos] = await Promise.all([
      this.prisma.track.findMany({
        take: 10,
        orderBy: { plays: 'desc' },
        select: { id: true, title: true, plays: true, artist: { select: { stageName: true } } },
      }),
      this.prisma.artistProfile.findMany({
        take: 10,
        orderBy: { totalFollowers: 'desc' },
        select: { id: true, stageName: true, totalFollowers: true, totalEarnings: true, isVerified: true },
      }),
      this.prisma.video.findMany({
        take: 10,
        orderBy: { views: 'desc' },
        select: { id: true, title: true, views: true, artist: { select: { stageName: true } } },
      }),
    ]);
    return { topTracks, topArtists, topVideos };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GESTION DES UTILISATEURS
  // ─────────────────────────────────────────────────────────────────────────

  async getUsers(params: {
    page?: number; limit?: number; search?: string;
    role?: string; isBanned?: boolean; sortBy?: string; sortOrder?: string;
  }) {
    const { page = 1, limit = 20, search, role, isBanned, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (isBanned !== undefined) where.isActive = !isBanned;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true, name: true, email: true, username: true, avatar: true,
          role: true, isActive: true, createdAt: true,
          artistProfile: { select: { id: true, stageName: true, isVerified: true, isActive: true } },
          subscription: { select: { tier: true, status: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        artistProfile: true,
        subscription: true,
      },
    });
    if (!user) throw new NotFoundException({ success: false, error: { message: 'Utilisateur introuvable' } });
    const { password, ...safeUser } = user;
    return safeUser;
  }

  async banUser(id: string, ban: boolean, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, error: { message: 'Utilisateur introuvable' } });
    if (user.role === 'ADMIN') throw new BadRequestException({ success: false, error: { message: 'Impossible de suspendre un admin' } });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: !ban },
    });

    if (ban) { // ban=true means deactivate (isActive=false)
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });
      await this.notificationsService.sendNotification(id, 'Compte suspendu',
        reason || 'Votre compte a été suspendu pour violation des conditions d\'utilisation.', 'SYSTEM', {});
    } else {
      await this.notificationsService.sendNotification(id, 'Compte réactivé',
        'Votre compte a été réactivé. Bienvenue à nouveau sur Kephale.', 'SYSTEM', {});
    }

    return updated;
  }

  async changeUserRole(id: string, role: string) {
    const validRoles = ['LISTENER', 'ARTIST', 'ADMIN'];
    if (!validRoles.includes(role)) throw new BadRequestException({ success: false, error: { message: 'Rôle invalide' } });

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, error: { message: 'Utilisateur introuvable' } });

    return this.prisma.user.update({ where: { id }, data: { role: role as any } });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, error: { message: 'Utilisateur introuvable' } });
    if (user.role === 'ADMIN') throw new BadRequestException({ success: false, error: { message: 'Impossible de supprimer un admin' } });
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  async notifyUser(userId: string, title: string, body: string) {
    await this.notificationsService.sendNotification(userId, title, body, 'SYSTEM', {});
    return { sent: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODÉRATION CONTENU — TRACKS
  // ─────────────────────────────────────────────────────────────────────────

  async getTracks(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const { page = 1, limit = 20, search, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { artist: { stageName: { contains: search, mode: 'insensitive' } } },
    ];
    if (status) where.status = status;

    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { artist: { select: { stageName: true, userId: true } }, album: { select: { title: true } } },
      }),
      this.prisma.track.count({ where }),
    ]);
    return { tracks, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateTrackStatus(id: string, status: string) {
    const track = await this.prisma.track.findUnique({ where: { id }, include: { artist: true } });
    if (!track) throw new NotFoundException({ success: false, error: { message: 'Piste introuvable' } });
    const updated = await this.prisma.track.update({ where: { id }, data: { status: status as any } });
    if (track.artist?.userId) {
      await this.notificationsService.sendNotification(
        track.artist.userId,
        status === 'PUBLISHED' ? 'Piste publiée' : 'Piste dépubliée',
        `Votre piste "${track.title}" a été ${status === 'PUBLISHED' ? 'publiée' : 'retirée'} par l'équipe Kephale.`,
        'SYSTEM', { trackId: id }
      );
    }
    return updated;
  }

  async deleteTrack(id: string) {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track) throw new NotFoundException({ success: false, error: { message: 'Piste introuvable' } });
    await this.prisma.track.delete({ where: { id } });
    return { deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODÉRATION CONTENU — VIDÉOS
  // ─────────────────────────────────────────────────────────────────────────

  async getVideos(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const { page = 1, limit = 20, search, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { artist: { stageName: { contains: search, mode: 'insensitive' } } },
    ];
    if (status) where.status = status;

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { artist: { select: { stageName: true, userId: true } } },
      }),
      this.prisma.video.count({ where }),
    ]);
    return { videos, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateVideoStatus(id: string, status: string) {
    const video = await this.prisma.video.findUnique({ where: { id }, include: { artist: true } });
    if (!video) throw new NotFoundException({ success: false, error: { message: 'Vidéo introuvable' } });
    const updated = await this.prisma.video.update({ where: { id }, data: { status: status as any } });
    if (video.artist?.userId) {
      await this.notificationsService.sendNotification(
        video.artist.userId, 'Statut de votre vidéo modifié',
        `Votre vidéo "${video.title}" a été mise à jour par l'équipe Kephale.`,
        'SYSTEM', { videoId: id }
      );
    }
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ARTISTES
  // ─────────────────────────────────────────────────────────────────────────

  async getArtists(params: { page?: number; limit?: number; search?: string; isVerified?: boolean }) {
    const { page = 1, limit = 20, search, isVerified } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [{ stageName: { contains: search, mode: 'insensitive' } }];
    if (isVerified !== undefined) where.isVerified = isVerified;

    const [artists, total] = await Promise.all([
      this.prisma.artistProfile.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } },
        },
      }),
      this.prisma.artistProfile.count({ where }),
    ]);
    return { artists, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async verifyArtist(id: string, verified: boolean) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { id } });
    if (!artist) throw new NotFoundException({ success: false, error: { message: 'Artiste introuvable' } });
    const updated = await this.prisma.artistProfile.update({ where: { id }, data: { isVerified: verified } });
    await this.notificationsService.sendNotification(
      artist.userId,
      verified ? '✅ Compte vérifié' : 'Vérification retirée',
      verified
        ? 'Félicitations ! Votre compte artiste a été vérifié par l\'équipe Kephale.'
        : 'La vérification de votre compte artiste a été retirée.',
      'SYSTEM', {}
    );
    return updated;
  }

  async getArtistEarnings(id: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { id } });
    if (!artist) throw new NotFoundException({ success: false, error: { message: 'Artiste introuvable' } });

    const [withdrawals, purchases] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where: { artistId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.purchase.findMany({
        where: { track: { artistId: id }, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { track: { select: { title: true } } },
      }),
    ]);

    return {
      profile: { totalEarnings: artist.totalEarnings, pendingPayout: artist.pendingPayout },
      withdrawals,
      recentPurchases: purchases,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FINANCES
  // ─────────────────────────────────────────────────────────────────────────

  async getWithdrawals(params: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { artist: { select: { id: true, stageName: true, userId: true, pendingPayout: true } } },
      }),
      this.prisma.withdrawal.count({ where }),
    ]);
    return { withdrawals, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateWithdrawalStatus(id: string, status: 'COMPLETED' | 'FAILED') {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id }, include: { artist: true } });
    if (!withdrawal) throw new NotFoundException({ success: false, error: { message: 'Demande introuvable' } });
    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
      throw new BadRequestException({ success: false, error: { message: 'Cette demande a déjà été traitée' } });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.update({ where: { id }, data: { status } });
      if (status === 'FAILED') {
        await tx.artistProfile.update({
          where: { id: withdrawal.artistId },
          data: { pendingPayout: { decrement: withdrawal.amount } },
        });
      }
      return w;
    });

    const msg = status === 'COMPLETED'
      ? { title: 'Retrait approuvé', body: `Votre demande de retrait de ${withdrawal.amount} FCFA a été envoyée avec succès.`, type: 'WITHDRAWAL_COMPLETED' }
      : { title: 'Retrait rejeté', body: `Votre demande de retrait de ${withdrawal.amount} FCFA n'a pas pu aboutir. Le montant a été recrédité.`, type: 'WITHDRAWAL_FAILED' };

    await this.notificationsService.sendNotification(withdrawal.artist.userId, msg.title, msg.body, msg.type as any, { withdrawalId: id });
    return updated;
  }

  async getPurchases(params: { page?: number; limit?: number; type?: string }) {
    const { page = 1, limit = 20, type } = params;
    const skip = (page - 1) * limit;
    const where: any = { status: 'SUCCEEDED' };
    if (type) where.type = type;

    const [purchases, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          track: { select: { title: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { purchases, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getRevenueStats() {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { start: d, end: new Date(now.getFullYear(), now.getMonth() - i + 1, 1), label: d.toLocaleString('fr-FR', { month: 'short', year: 'numeric' }) };
    }).reverse();

    const monthly = await Promise.all(months.map(async (m) => {
      const agg = await this.prisma.purchase.aggregate({
        _sum: { platformFeeAmount: true, amount: true },
        where: { status: 'SUCCEEDED', createdAt: { gte: m.start, lt: m.end } },
      });
      return { label: m.label, platformRevenue: agg._sum.platformFeeAmount || 0, grossRevenue: agg._sum.amount || 0 };
    }));

    const byType = await this.prisma.purchase.groupBy({
      by: ['type'],
      _sum: { platformFeeAmount: true },
      where: { status: 'SUCCEEDED' },
    });

    return { monthly, byType };
  }

  async getSubscriptions(params: { page?: number; limit?: number; tier?: string; status?: string }) {
    const { page = 1, limit = 20, tier, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (tier) where.tier = tier;
    if (status) where.status = status;

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where, skip, take: limit, orderBy: { updatedAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return { subscriptions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COPYRIGHT
  // ─────────────────────────────────────────────────────────────────────────

  async getCopyrightReports(params: { page?: number; limit?: number; status?: string }) {
    const { page = 1, limit = 20, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [reports, total] = await Promise.all([
      this.prisma.copyrightReport.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          video: { select: { id: true, title: true } },
          track: { select: { id: true, title: true } },
          reporter: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.copyrightReport.count({ where }),
    ]);
    return { reports, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async resolveCopyrightReport(id: string, action: 'APPROVED' | 'REJECTED', adminNote?: string) {
    const report = await this.prisma.copyrightReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException({ success: false, error: { message: 'Rapport introuvable' } });

    const updated = await this.prisma.copyrightReport.update({
      where: { id },
      data: { status: action, adminNotes: adminNote },
    });

    await this.notificationsService.sendNotification(
      report.reporterId,
      action === 'APPROVED' ? 'Signalement accepté' : 'Signalement rejeté',
      action === 'APPROVED'
        ? 'Votre signalement de violation de copyright a été accepté et le contenu a été retiré.'
        : 'Votre signalement a été examiné et rejeté après vérification.',
      'SYSTEM', { reportId: id }
    );
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BROADCAST NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  async broadcastNotification(title: string, body: string, segment?: string) {
    let users: { id: string }[];

    if (segment === 'artists') {
      const artists = await this.prisma.artistProfile.findMany({ select: { userId: true } });
      users = artists.map(a => ({ id: a.userId }));
    } else if (segment === 'premium') {
      const subs = await this.prisma.subscription.findMany({
        where: { tier: { not: 'FREE' }, status: 'ACTIVE' },
        select: { userId: true },
      });
      users = subs.map(s => ({ id: s.userId }));
    } else {
      users = await this.prisma.user.findMany({
        where: { isActive: true, role: { not: 'ADMIN' } },
        select: { id: true },
      });
    }

    const BATCH_SIZE = 100;
    let sent = 0;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(u =>
        this.notificationsService.sendNotification(u.id, title, body, 'SYSTEM', {}).catch(() => {})
      ));
      sent += batch.length;
    }
    return { sent, total: users.length, segment: segment || 'all' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SYSTÈME
  // ─────────────────────────────────────────────────────────────────────────

  async getSystemHealth() {
    const results: Record<string, any> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      results.database = { status: 'healthy' };
    } catch (e: any) {
      results.database = { status: 'error', message: e.message };
    }

    try {
      await this.redis.set('admin:healthcheck', '1', 'EX', 5);
      results.redis = { status: 'healthy' };
    } catch (e: any) {
      results.redis = { status: 'error', message: e.message };
    }

    results.uptime = process.uptime();
    results.memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    results.nodeVersion = process.version;
    results.environment = process.env.NODE_ENV;

    return results;
  }

  async flushCache(pattern?: string) {
    const target = pattern || 'feed:*';
    const keys = await this.redis.keys(target);
    if (keys.length > 0) {
      await Promise.all(keys.map(k => this.redis.del(k)));
    }
    return { flushed: keys.length, pattern: target };
  }
}

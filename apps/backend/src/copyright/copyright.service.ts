import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const STRIKE_DURATION_DAYS = 90; // Un strike expire après 90 jours
const MAX_STRIKES_BEFORE_BAN = 3;

@Injectable()
export class CopyrightService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async submitReport(params: {
    reporterId: string;
    videoId: string;
    trackId: string;
    reason?: string;
  }) {
    const { reporterId, videoId, trackId, reason } = params;

    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: { select: { userId: true, stageName: true } } },
    });

    if (!track) throw new NotFoundException('Track non trouvé');
    if (track.artist.userId !== reporterId) throw new ForbiddenException('Vous n\'êtes pas le propriétaire de ce titre');

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, artistId: true, title: true, status: true },
    });

    if (!video) throw new NotFoundException('Vidéo non trouvée');

    if (video.artistId) {
      const videoArtist = await this.prisma.artistProfile.findUnique({
        where: { id: video.artistId },
        select: { userId: true },
      });
      if (videoArtist && videoArtist.userId === reporterId) {
        throw new BadRequestException('Vous ne pouvez pas signaler votre propre vidéo');
      }
    }
    if (video.userId === reporterId) {
      throw new BadRequestException('Vous ne pouvez pas signaler votre propre vidéo');
    }

    try {
      const report = await this.prisma.copyrightReport.create({
        data: {
          reporterId,
          videoId,
          trackId,
          reason: reason || `Utilisation non autorisée du titre "${track.title}"`,
          status: 'PENDING',
        },
      });

      console.log(`[Copyright] New report: ${report.id} — Video "${video.title}" uses track "${track.title}"`);
      return { success: true, reportId: report.id };
    } catch (err: any) {
      if (err.code === 'P2002') throw new BadRequestException('Vous avez déjà signalé cette vidéo');
      throw err;
    }
  }

  async confirmReport(params: { reportId: string; adminNotes?: string }) {
    const { reportId, adminNotes } = params;

    const report = await this.prisma.copyrightReport.findUnique({
      where: { id: reportId },
      include: {
        video: { select: { id: true, userId: true, artistId: true, title: true } },
        track: { select: { id: true, title: true, artist: { select: { stageName: true } } } },
      },
    });

    if (!report) throw new NotFoundException('Rapport non trouvé');
    if (report.status !== 'PENDING') throw new BadRequestException('Ce rapport a déjà été traité');

    let violatorUserId: string | null = null;
    if (report.video.userId) {
      violatorUserId = report.video.userId;
    } else if (report.video.artistId) {
      const artist = await this.prisma.artistProfile.findUnique({
        where: { id: report.video.artistId },
        select: { userId: true },
      });
      violatorUserId = artist?.userId || null;
    }

    if (!violatorUserId) throw new BadRequestException('Impossible de déterminer le propriétaire de la vidéo');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + STRIKE_DURATION_DAYS);

    const [, strike] = await this.prisma.$transaction([
      this.prisma.copyrightReport.update({
        where: { id: reportId },
        data: { status: 'CONFIRMED', adminNotes, resolvedAt: new Date() },
      }),
      this.prisma.copyrightStrike.create({
        data: { userId: violatorUserId, reportId, videoId: report.videoId, expiresAt },
      }),
      this.prisma.video.update({
        where: { id: report.videoId },
        data: { status: 'INACTIVE' },
      }),
    ]);

    const now = new Date();
    const activeStrikes = await this.prisma.copyrightStrike.count({
      where: {
        userId: violatorUserId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    const userBanned = activeStrikes >= MAX_STRIKES_BEFORE_BAN;

    try {
      const notifBody = userBanned
        ? `Votre vidéo "${report.video.title}" a été supprimée. Vous avez ${activeStrikes} strikes — vos uploads sont bloqués.`
        : `Votre vidéo "${report.video.title}" a été supprimée pour violation du titre "${report.track.title}" de ${report.track.artist.stageName}. Strike ${activeStrikes}/${MAX_STRIKES_BEFORE_BAN}.`;

      await this.notificationsService.sendNotification(
        violatorUserId,
        'Violation de droits d\'auteur',
        notifBody,
        'COPYRIGHT_STRIKE',
        { videoId: report.videoId, strikeId: strike.id }
      );
    } catch (err) {
      console.error('[Copyright] Failed to notify user:', err);
    }

    return { success: true, strikeId: strike.id, totalStrikes: activeStrikes, userBanned };
  }

  async rejectReport(params: { reportId: string; adminNotes?: string }) {
    const { reportId, adminNotes } = params;

    const report = await this.prisma.copyrightReport.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Rapport non trouvé');
    if (report.status !== 'PENDING') throw new BadRequestException('Ce rapport a déjà été traité');

    await this.prisma.copyrightReport.update({
      where: { id: reportId },
      data: { status: 'REJECTED', adminNotes, resolvedAt: new Date() },
    });

    return { success: true };
  }

  async getMyReports(userId: string) {
    const reports = await this.prisma.copyrightReport.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        video: { select: { id: true, title: true, thumbnailUrl: true } },
        track: { select: { id: true, title: true } },
        strike: { select: { id: true, createdAt: true } },
      },
    });

    return reports;
  }

  async listReports(params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;

    const [total, reports] = await Promise.all([
      this.prisma.copyrightReport.count({ where }),
      this.prisma.copyrightReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, name: true, avatar: true } },
          video: {
            select: {
              id: true, title: true, thumbnailUrl: true, userId: true, artistId: true,
              user: { select: { id: true, name: true, avatar: true } },
              artist: { select: { id: true, stageName: true, avatar: true } },
            },
          },
          track: {
            select: {
              id: true, title: true, coverUrl: true,
              artist: { select: { id: true, stageName: true } },
            },
          },
          strike: { select: { id: true, createdAt: true } },
        },
      }),
    ]);

    return {
      reports,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getUserStrikes(userId: string) {
    const now = new Date();
    const strikes = await this.prisma.copyrightStrike.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        report: {
          select: {
            reason: true,
            track: { select: { id: true, title: true, artist: { select: { stageName: true } } } },
          },
        },
        video: { select: { id: true, title: true } },
      },
    });

    return {
      strikes,
      totalActive: strikes.length,
      isBlocked: strikes.length >= MAX_STRIKES_BEFORE_BAN,
    };
  }
}

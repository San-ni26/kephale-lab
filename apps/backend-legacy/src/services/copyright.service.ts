import { prisma } from '@kephale/database';
import { NotificationService } from './notification.service.js';

const STRIKE_DURATION_DAYS = 90; // Un strike expire après 90 jours
const MAX_STRIKES_BEFORE_BAN = 3;

export class CopyrightService {

  /**
   * Soumet un signalement de violation de droits d'auteur.
   * Un artiste signale qu'une vidéo utilise sa musique sans autorisation.
   */
  static async submitReport(params: {
    reporterId: string; // userId de l'artiste qui signale
    videoId: string;
    trackId: string;
    reason?: string;
  }): Promise<{
    success: boolean;
    reportId?: string;
    error?: string;
  }> {
    const { reporterId, videoId, trackId, reason } = params;

    // Vérifier que le reporter est bien le propriétaire du track
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: { select: { userId: true, stageName: true } } },
    });

    if (!track) {
      return { success: false, error: 'Track non trouvé' };
    }

    if (track.artist.userId !== reporterId) {
      return { success: false, error: 'Vous n\'êtes pas le propriétaire de ce titre' };
    }

    // Vérifier que la vidéo existe
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, artistId: true, title: true, status: true },
    });

    if (!video) {
      return { success: false, error: 'Vidéo non trouvée' };
    }

    // Vérifier que l'artiste ne signale pas sa propre vidéo
    if (video.artistId) {
      const videoArtist = await prisma.artistProfile.findUnique({
        where: { id: video.artistId },
        select: { userId: true },
      });
      if (videoArtist && videoArtist.userId === reporterId) {
        return { success: false, error: 'Vous ne pouvez pas signaler votre propre vidéo' };
      }
    }
    if (video.userId === reporterId) {
      return { success: false, error: 'Vous ne pouvez pas signaler votre propre vidéo' };
    }

    // Créer le signalement
    try {
      const report = await prisma.copyrightReport.create({
        data: {
          reporterId,
          videoId,
          trackId,
          reason: reason || `Utilisation non autorisée du titre "${track.title}"`,
          status: 'PENDING',
        },
      });

      // Notifier les admins (via un log pour l'instant)
      console.log(`[Copyright] New report: ${report.id} — Video "${video.title}" uses track "${track.title}"`);

      return { success: true, reportId: report.id };
    } catch (err: any) {
      if (err.code === 'P2002') {
        return { success: false, error: 'Vous avez déjà signalé cette vidéo' };
      }
      throw err;
    }
  }

  /**
   * Un admin confirme un signalement et crée un copyright strike.
   */
  static async confirmReport(params: {
    reportId: string;
    adminNotes?: string;
  }): Promise<{
    success: boolean;
    strikeId?: string;
    totalStrikes?: number;
    userBanned?: boolean;
    error?: string;
  }> {
    const { reportId, adminNotes } = params;

    const report = await prisma.copyrightReport.findUnique({
      where: { id: reportId },
      include: {
        video: {
          select: { id: true, userId: true, artistId: true, title: true },
        },
        track: {
          select: { id: true, title: true, artist: { select: { stageName: true } } },
        },
      },
    });

    if (!report) {
      return { success: false, error: 'Rapport non trouvé' };
    }

    if (report.status !== 'PENDING') {
      return { success: false, error: 'Ce rapport a déjà été traité' };
    }

    // Déterminer le userId du contrevenant
    let violatorUserId: string | null = null;
    if (report.video.userId) {
      violatorUserId = report.video.userId;
    } else if (report.video.artistId) {
      const artist = await prisma.artistProfile.findUnique({
        where: { id: report.video.artistId },
        select: { userId: true },
      });
      violatorUserId = artist?.userId || null;
    }

    if (!violatorUserId) {
      return { success: false, error: 'Impossible de déterminer le propriétaire de la vidéo' };
    }

    // Transaction : mettre à jour le rapport, créer le strike, désactiver la vidéo
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + STRIKE_DURATION_DAYS);

    const [, strike] = await prisma.$transaction([
      // Mettre à jour le rapport
      prisma.copyrightReport.update({
        where: { id: reportId },
        data: {
          status: 'CONFIRMED',
          adminNotes,
          resolvedAt: new Date(),
        },
      }),

      // Créer le copyright strike
      prisma.copyrightStrike.create({
        data: {
          userId: violatorUserId,
          reportId,
          videoId: report.videoId,
          expiresAt,
        },
      }),

      // Désactiver la vidéo en infraction
      prisma.video.update({
        where: { id: report.videoId },
        data: { status: 'INACTIVE' },
      }),
    ]);

    // Compter les strikes actifs
    const now = new Date();
    const activeStrikes = await prisma.copyrightStrike.count({
      where: {
        userId: violatorUserId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    const userBanned = activeStrikes >= MAX_STRIKES_BEFORE_BAN;

    // Notifier le contrevenant
    try {
      const notifBody = userBanned
        ? `Votre vidéo "${report.video.title}" a été supprimée. Vous avez ${activeStrikes} strikes — vos uploads sont bloqués.`
        : `Votre vidéo "${report.video.title}" a été supprimée pour violation du titre "${report.track.title}" de ${report.track.artist.stageName}. Strike ${activeStrikes}/${MAX_STRIKES_BEFORE_BAN}.`;

      await NotificationService.sendNotification(
        violatorUserId,
        '⚠️ Violation de droits d\'auteur',
        notifBody,
        'COPYRIGHT_STRIKE',
        { videoId: report.videoId, strikeId: strike.id }
      );
    } catch (err) {
      console.error('[Copyright] Failed to notify user:', err);
    }

    return {
      success: true,
      strikeId: strike.id,
      totalStrikes: activeStrikes,
      userBanned,
    };
  }

  /**
   * Un admin rejette un signalement.
   */
  static async rejectReport(params: {
    reportId: string;
    adminNotes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { reportId, adminNotes } = params;

    const report = await prisma.copyrightReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return { success: false, error: 'Rapport non trouvé' };
    }

    if (report.status !== 'PENDING') {
      return { success: false, error: 'Ce rapport a déjà été traité' };
    }

    await prisma.copyrightReport.update({
      where: { id: reportId },
      data: {
        status: 'REJECTED',
        adminNotes,
        resolvedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Liste les signalements pour l'admin (avec pagination et filtre par statut).
   */
  static async listReports(params: {
    status?: string;
    page: number;
    limit: number;
  }) {
    const { status, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;

    const [total, reports] = await Promise.all([
      prisma.copyrightReport.count({ where }),
      prisma.copyrightReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, name: true, avatar: true } },
          video: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              userId: true,
              artistId: true,
              user: { select: { id: true, name: true, avatar: true } },
              artist: { select: { id: true, stageName: true, avatar: true } },
            },
          },
          track: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
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
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Récupère les strikes actifs d'un utilisateur.
   */
  static async getUserStrikes(userId: string) {
    const now = new Date();
    const strikes = await prisma.copyrightStrike.findMany({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
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

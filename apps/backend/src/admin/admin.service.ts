import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getStats() {
    const [totalUsers, totalArtists, totalTracks, totalAlbums, totalVideos] = await Promise.all([
      this.prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      this.prisma.artistProfile.count({ where: { isActive: true } }),
      this.prisma.track.count(),
      this.prisma.album.count(),
      this.prisma.video.count(),
    ]);

    const purchasesAggr = await this.prisma.purchase.aggregate({
      _sum: {
        platformFeeAmount: true
      },
      where: {
        status: 'SUCCEEDED'
      }
    });

    const totalPlatformRevenue = purchasesAggr._sum.platformFeeAmount || 0;

    return {
      users: totalUsers,
      artists: totalArtists,
      content: {
        tracks: totalTracks,
        albums: totalAlbums,
        videos: totalVideos,
      },
      revenueFcfa: totalPlatformRevenue
    };
  }

  async getWithdrawals() {
    const withdrawals = await this.prisma.withdrawal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        artist: {
          select: { id: true, stageName: true, userId: true, pendingPayout: true }
        }
      }
    });
    return withdrawals;
  }

  async updateWithdrawalStatus(id: string, status: 'COMPLETED' | 'FAILED') {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id },
      include: { artist: true }
    });

    if (!withdrawal) {
      throw new NotFoundException({ success: false, error: { message: 'Demande introuvable' } });
    }

    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
      throw new BadRequestException({ success: false, error: { message: 'Cette demande a déjà été traitée' } });
    }

    const updatedWithdrawal = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.withdrawal.update({
        where: { id },
        data: { status }
      });

      if (status === 'FAILED') {
        await tx.artistProfile.update({
          where: { id: withdrawal.artistId },
          data: { pendingPayout: { decrement: withdrawal.amount } }
        });
      }

      return updated;
    });

    if (status === 'COMPLETED') {
      await this.notificationsService.sendNotification(
        withdrawal.artist.userId,
        'Retrait approuvé',
        `Votre demande de retrait de ${withdrawal.amount} FCFA a été envoyée avec succès.`,
        'WITHDRAWAL_COMPLETED',
        { withdrawalId: withdrawal.id }
      );
    } else if (status === 'FAILED') {
      await this.notificationsService.sendNotification(
        withdrawal.artist.userId,
        'Retrait rejeté',
        `Votre demande de retrait de ${withdrawal.amount} FCFA n'a pas pu aboutir. Le montant a été recrédité sur votre solde.`,
        'WITHDRAWAL_FAILED',
        { withdrawalId: withdrawal.id }
      );
    }

    return updatedWithdrawal;
  }
}

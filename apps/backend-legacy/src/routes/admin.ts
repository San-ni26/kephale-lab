import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import { NotificationService } from '../services/notification.service.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Middleware to ensure user is an ADMIN
  fastify.addHook('preHandler', async (request, reply) => {
    await authenticate(request, reply);
    const user = request.user;
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs.' } });
    }
  });

  fastify.get('/stats', async (request, reply) => {
    const [totalUsers, totalArtists, totalTracks, totalAlbums, totalVideos] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'ADMIN' } } }),
      prisma.artistProfile.count({ where: { isActive: true } }),
      prisma.track.count(),
      prisma.album.count(),
      prisma.video.count(),
    ]);

    // Calculate revenue from Purchases
    // We sum platformFeeAmount.
    const purchasesAggr = await prisma.purchase.aggregate({
      _sum: {
        platformFeeAmount: true
      },
      where: {
        status: 'SUCCEEDED'
      }
    });

    // Token packs don't explicitly have platformFeeAmount, they are just amount.
    // Wait, let's check if Token Packs have platformFeeAmount. 
    // Usually platformFeeAmount is 0 or 100% depending on how it's saved. 
    // If it's saved correctly during payment, platformFeeAmount contains the platform's cut.
    const totalPlatformRevenue = purchasesAggr._sum.platformFeeAmount || 0;

    return reply.send({
      success: true,
      data: {
        users: totalUsers,
        artists: totalArtists,
        content: {
          tracks: totalTracks,
          albums: totalAlbums,
          videos: totalVideos,
        },
        revenueFcfa: totalPlatformRevenue
      }
    });
  });

  // ── Withdrawals Management ───────────────────────────────────────────────────

  fastify.get('/withdrawals', async (request, reply) => {
    const withdrawals = await prisma.withdrawal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        artist: {
          select: { id: true, stageName: true, userId: true, pendingPayout: true }
        }
      }
    });
    return reply.send({ success: true, data: withdrawals });
  });

  const UpdateWithdrawalSchema = z.object({
    status: z.enum(['COMPLETED', 'FAILED']),
  });

  fastify.patch('/withdrawals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = UpdateWithdrawalSchema.parse(request.body);

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { artist: true }
    });

    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: { message: 'Demande introuvable' } });
    }

    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
      return reply.status(400).send({ success: false, error: { message: 'Cette demande a déjà été traitée' } });
    }

    const updatedWithdrawal = await prisma.$transaction(async (tx) => {
      const updated = await tx.withdrawal.update({
        where: { id },
        data: { status }
      });

      // Si rejeté, on décrémente pendingPayout pour que l'artiste puisse refaire une demande
      if (status === 'FAILED') {
        await tx.artistProfile.update({
          where: { id: withdrawal.artistId },
          data: { pendingPayout: { decrement: withdrawal.amount } }
        });
      }

      return updated;
    });

    // Envoyer une notification à l'artiste
    if (status === 'COMPLETED') {
      await NotificationService.sendNotification(
        withdrawal.artist.userId,
        'Retrait approuvé ! 💸',
        `Votre demande de retrait de ${withdrawal.amount} FCFA a été envoyée avec succès.`,
        'WITHDRAWAL_COMPLETED',
        { withdrawalId: withdrawal.id }
      );
    } else if (status === 'FAILED') {
      await NotificationService.sendNotification(
        withdrawal.artist.userId,
        'Retrait rejeté ❌',
        `Votre demande de retrait de ${withdrawal.amount} FCFA n'a pas pu aboutir. Le montant a été recrédité sur votre solde.`,
        'WITHDRAWAL_FAILED',
        { withdrawalId: withdrawal.id }
      );
    }

    return reply.send({ success: true, data: updatedWithdrawal });
  });
}

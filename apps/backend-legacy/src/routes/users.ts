import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().url().optional(),
  phoneNumber: z.string().optional(),
});

const DeleteAccountSchema = z.object({
  password: z.string().optional(),
  artistAction: z.enum(['TRANSFER', 'DELETE']).optional(),
});

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { artistProfile: true, subscription: true },
    });
    if (!userData) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return reply.send({ success: true, data: userData });
  });

  fastify.put('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = UpdateProfileSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } });
    }

    if (body.data.phoneNumber) {
      const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: body.data.phoneNumber } });
      if (existingPhone && existingPhone.id !== user.userId) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Ce numéro de téléphone est déjà utilisé par un autre compte.' } });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.userId },
      data: body.data,
      include: { artistProfile: true, subscription: true },
    });

    return reply.send({ success: true, data: updatedUser });
  });

  fastify.delete('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = DeleteAccountSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { artistProfile: true },
    });
    if (!dbUser) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    // Validate password if user has one
    if (dbUser.password) {
      if (!body.data.password) {
        return reply.status(400).send({ success: false, error: { code: 'PASSWORD_REQUIRED', message: 'Mot de passe requis pour supprimer le compte' } });
      }
      const isValid = await bcrypt.compare(body.data.password, dbUser.password);
      if (!isValid) {
        return reply.status(403).send({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect' } });
      }
    }

    // Artist logic
    if (dbUser.artistProfile) {
      const artist = dbUser.artistProfile;
      // Calculate available balance
      const revenueAgg = await prisma.purchase.aggregate({
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

      const previousWithdrawalsAgg = await prisma.withdrawal.aggregate({
        where: { artistId: artist.id, status: { in: ['COMPLETED', 'PROCESSING', 'PENDING'] } },
        _sum: { amount: true },
      });
      const totalWithdrawnOrPending = previousWithdrawalsAgg._sum.amount || 0;
      const availableBalance = trueTotalEarnings - totalWithdrawnOrPending;

      if (availableBalance >= 500) {
        return reply.status(400).send({ success: false, error: { code: 'PENDING_PAYOUT', message: 'Veuillez retirer vos fonds (solde > 500 FCFA) avant de supprimer votre compte.' } });
      }

      if (!body.data.artistAction) {
        return reply.status(400).send({ success: false, error: { code: 'ACTION_REQUIRED', message: 'Précisez ce que vous voulez faire de vos contenus (TRANSFER ou DELETE).' } });
      }

      if (body.data.artistAction === 'TRANSFER') {
        // Find or create Kephale Archives
        let archiveArtist = await prisma.artistProfile.findFirst({
          where: { stageName: 'Kephale Archives' }
        });

        if (!archiveArtist) {
          // Check if system user exists
          let systemUser = await prisma.user.findUnique({ where: { email: 'system@kephale.com' } });
          if (!systemUser) {
            systemUser = await prisma.user.create({
              data: {
                email: 'system@kephale.com',
                name: 'Kephale System',
                username: '@kephale_system',
                role: 'ADMIN',
              }
            });
          }
          archiveArtist = await prisma.artistProfile.create({
            data: {
              userId: systemUser.id,
              stageName: 'Kephale Archives',
              bio: 'Contenus cédés à Kephale.',
              isActive: false,
              country: 'SN',
            }
          });
        }

        // Transfer Tracks, Albums, Videos
        await prisma.track.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
        await prisma.album.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
        await prisma.video.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
      }
      // If DELETE, relations will cascade when user is deleted
    }

    // 🔐 Révoquer tous les refresh tokens actifs avant suppression
    // Sans ça, l'ancien utilisateur peut continuer à s'authentifier jusqu'à expiration (30j)
    await prisma.refreshToken.updateMany({
      where: { userId: user.userId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Delete user (cascade deletes artist profile, tracks (if not transferred), likes, etc.)
    await prisma.user.delete({ where: { id: user.userId } });

    return reply.send({ success: true, data: { message: 'Account deleted' } });
  });

  fastify.get('/me/purchases', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const purchases = await prisma.purchase.findMany({
      where: { userId: user.userId },
      include: {
        track: { include: { artist: true } },
        album: { include: { artist: true } },
        video: { include: { artist: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: purchases });
  });

  fastify.get('/search', { preHandler: [authenticate] }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.length < 2) return reply.send({ success: true, data: [] });
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { artistProfile: { stageName: { contains: q, mode: 'insensitive' } } }
        ]
      },
      include: { artistProfile: { select: { stageName: true, avatar: true, id: true } } },
      take: 20
    });
    
    return reply.send({ success: true, data: users });
  });

  fastify.post('/sync-contacts', { preHandler: [authenticate] }, async (request, reply) => {
    const schema = z.object({ phoneNumbers: z.array(z.string()) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: { message: 'Invalid data' } });
    
    const normalizedPhones = parsed.data.phoneNumbers.map(p => p.replace(/[\s\-()]/g, ''));
    
    const users = await prisma.user.findMany({
      where: {
        phoneNumber: { in: normalizedPhones },
        isActive: true,
      },
      select: {
        id: true, name: true, username: true, avatar: true, phoneNumber: true,
        artistProfile: { select: { stageName: true, avatar: true, id: true } }
      }
    });

    return reply.send({ success: true, data: users });
  });
}

import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { publishUserUpdate } from '../lib/redisPubSub.js';

const SUBSCRIPTION_TIERS = {
  PREMIUM: {
    tier: 'PREMIUM',
    priceTokens: 500,
    quota: 50,
    features: ['50 écoutes Premium par mois', 'Qualité standard', 'Sans publicité'],
  },
  PREMIUM_PLUS: {
    tier: 'PREMIUM_PLUS',
    priceTokens: 1000,
    quota: 500, // ou illimité
    features: ['Écoutes Premium illimitées', 'Haute qualité audio', 'Événements Live exclusifs', 'Sans publicité'],
  },
};

const SubscribeSchema = z.object({
  tier: z.enum(['PREMIUM', 'PREMIUM_PLUS']),
  password: z.string().min(1, 'La confirmation est requise'),
});

export async function subscriptionRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/subscriptions/tiers
   * Récupère la liste des forfaits
   */
  fastify.get('/tiers', async (request, reply) => {
    return reply.send({
      success: true,
      data: Object.values(SUBSCRIPTION_TIERS),
    });
  });

  /**
   * POST /api/v1/subscriptions/subscribe
   * Souscrire à un forfait en payant par jetons
   */
  fastify.post('/subscribe', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = SubscribeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });
    }

    const requestedTier = SUBSCRIPTION_TIERS[body.data.tier];
    if (!requestedTier) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_TIER', message: 'Forfait invalide' } });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { subscription: true },
    });

    if (!dbUser) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' } });
    }

    // Validation du mot de passe / confirmation
    if (dbUser.password) {
      const isValid = await bcrypt.compare(body.data.password, dbUser.password);
      if (!isValid) {
        return reply.status(401).send({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect' } });
      }
    } else {
      if (body.data.password !== 'CONFIRMER') {
        return reply.status(401).send({ success: false, error: { code: 'INVALID_CONFIRMATION', message: 'Veuillez taper CONFIRMER' } });
      }
    }

    if (dbUser.tokenBalance < requestedTier.priceTokens) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INSUFFICIENT_FUNDS', message: 'Solde de jetons insuffisant. Veuillez recharger votre compte.' },
      });
    }

    // Calcul de la période : 30 jours à partir d'aujourd'hui
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    // Transaction pour déduire les jetons et activer l'abonnement
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.userId },
        data: { tokenBalance: { decrement: requestedTier.priceTokens } },
      });

      if (dbUser.subscription) {
        await tx.subscription.update({
          where: { id: dbUser.subscription.id },
          data: {
            status: 'ACTIVE',
            tier: body.data.tier,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paidStreamsUsed: 0,
            cancelAtPeriodEnd: false, // On reset au cas où il avait annulé avant
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId: user.userId,
            status: 'ACTIVE',
            tier: body.data.tier,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paidStreamsUsed: 0,
          },
        });
      }
    });

    // On renvoie le nouveau solde et l'abonnement mis à jour
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { subscription: true },
    });

    // Envoyer la notification temps réel
    publishUserUpdate(user.userId, { type: 'SUBSCRIPTION_CHANGED', tokenBalance: updatedUser?.tokenBalance });

    return reply.send({
      success: true,
      data: updatedUser,
      message: `Abonnement ${body.data.tier} activé avec succès !`,
    });
  });

  /**
   * POST /api/v1/subscriptions/cancel
   * Désactiver le renouvellement automatique (s'il devait y en avoir un, 
   * bien que basé sur les jetons, cela empêche le script cron de prélever le mois suivant)
   */
  fastify.post('/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;

    const sub = await prisma.subscription.findUnique({ where: { userId: user.userId } });
    if (!sub || sub.status !== 'ACTIVE') {
      return reply.status(400).send({ success: false, error: { code: 'NO_ACTIVE_SUB', message: 'Aucun abonnement actif à annuler' } });
    }

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    publishUserUpdate(user.userId, { type: 'SUBSCRIPTION_CANCELLED' });

    return reply.send({ success: true, data: updated, message: "L'abonnement sera annulé à la fin de la période actuelle." });
  });
}

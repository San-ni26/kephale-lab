import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from '../chat/chat.gateway';

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

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly chatGateway: ChatGateway, // to emit real-time events
  ) {}

  getTiers() {
    return Object.values(SUBSCRIPTION_TIERS);
  }

  async subscribe(userId: string, data: { tier: 'PREMIUM' | 'PREMIUM_PLUS', password?: string }) {
    const requestedTier = SUBSCRIPTION_TIERS[data.tier];
    if (!requestedTier) {
      throw new BadRequestException({ success: false, error: { code: 'INVALID_TIER', message: 'Forfait invalide' } });
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!dbUser) {
      throw new NotFoundException({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' } });
    }

    if (dbUser.password) {
      if (!data.password) throw new UnauthorizedException({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe requis' } });
      const isValid = await bcrypt.compare(data.password, dbUser.password);
      if (!isValid) {
        throw new UnauthorizedException({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect' } });
      }
    } else {
      if (data.password !== 'CONFIRMER') {
        throw new UnauthorizedException({ success: false, error: { code: 'INVALID_CONFIRMATION', message: 'Veuillez taper CONFIRMER' } });
      }
    }

    if (dbUser.tokenBalance < requestedTier.priceTokens) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INSUFFICIENT_FUNDS', message: 'Solde de jetons insuffisant. Veuillez recharger votre compte.' },
      });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { decrement: requestedTier.priceTokens } },
      });

      if (dbUser.subscription) {
        await tx.subscription.update({
          where: { id: dbUser.subscription.id },
          data: {
            status: 'ACTIVE',
            tier: data.tier,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paidStreamsUsed: 0,
            cancelAtPeriodEnd: false,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId: userId,
            status: 'ACTIVE',
            tier: data.tier,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            paidStreamsUsed: 0,
          },
        });
      }
    });

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    this.chatGateway.sendToUser(userId, 'SUBSCRIPTION_CHANGED', { tokenBalance: updatedUser?.tokenBalance });

    return updatedUser;
  }

  async cancelSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!sub || sub.status !== 'ACTIVE') {
      throw new BadRequestException({ success: false, error: { code: 'NO_ACTIVE_SUB', message: 'Aucun abonnement actif à annuler' } });
    }

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    this.chatGateway.sendToUser(userId, 'SUBSCRIPTION_CANCELLED', {});

    return updated;
  }
}

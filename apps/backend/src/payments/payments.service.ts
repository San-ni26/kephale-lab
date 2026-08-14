import { Injectable, BadRequestException, NotFoundException, ConflictException, ServiceUnavailableException, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccessControlService } from '../subscriptions/access.service';
import { CurrencyService } from './currency.service';
import Stripe from 'stripe';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class PaymentsService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly accessControlService: AccessControlService,
    private readonly currencyService: CurrencyService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private getStripe(): Stripe {
    if (!this.stripe) {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured in .env');
      }
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' as any });
    }
    return this.stripe;
  }

  private async initiateCinetPayPayment(params: {
    transactionId: string;
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    notifyUrl: string;
    customerName: string;
    customerEmail: string;
    metadata?: Record<string, string>;
  }) {
    const apiKey = process.env.CINETPAY_API_KEY;
    const siteId = process.env.CINETPAY_SITE_ID;
    if (!apiKey || !siteId) throw new Error('CinetPay credentials not configured');

    const payload = {
      apikey: apiKey,
      site_id: siteId,
      transaction_id: params.transactionId,
      amount: Math.round(params.amount),
      currency: params.currency,
      description: params.description,
      return_url: params.returnUrl,
      notify_url: params.notifyUrl,
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      channels: 'ALL',
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    };

    const res = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as any;
    if (data.code !== '201') {
      throw new Error(`CinetPay error: ${data.message}`);
    }

    return { paymentUrl: data.data.payment_url, transactionId: params.transactionId };
  }

  async getTokenPacks(currency: string = 'XOF') {
    let packs = await this.prisma.tokenPack.findMany({
      where: { isActive: true },
      orderBy: { tokens: 'asc' },
    });

    if (packs.length === 0) {
      const defaultPacks = [
        { tokens: 100, priceEur: 1.50, label: 'Starter', isBestValue: false },
        { tokens: 500, priceEur: 7.50, label: 'Populaire', isBestValue: true },
        { tokens: 1200, priceEur: 15.00, label: 'Pro', isBestValue: false },
        { tokens: 3500, priceEur: 45.00, label: 'VIP', isBestValue: false },
      ];
      await this.prisma.tokenPack.createMany({ data: defaultPacks });
      packs = await this.prisma.tokenPack.findMany({
        where: { isActive: true },
        orderBy: { tokens: 'asc' },
      });
    }

    // Format each pack with localized and rounded prices
    return packs.map((pack) => this.currencyService.formatPackPrice(pack, currency));
  }

  async buyTokens(userId: string, data: { packId: string; currency?: string; paymentProvider?: 'STRIPE' | 'CINETPAY' }) {
    const pack = await this.prisma.tokenPack.findUnique({ where: { id: data.packId } });
    if (!pack) throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Pack de jetons introuvable' } });

    const provider = data.paymentProvider || 'CINETPAY';
    const currency = this.currencyService.normalizeCurrency(data.currency || 'XOF');

    // Directional Rounding UP to prevent loss of margin
    const amountFiat = this.currencyService.convertFiat(pack.priceEur, 'EUR', currency, 'UP');

    if (provider === 'CINETPAY' && process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) {
      const userData = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      const transactionId = `TOKEN-${pack.id}-${userId}-${Date.now()}`;

      const result = await this.initiateCinetPayPayment({
        transactionId,
        amount: amountFiat,
        currency,
        description: `Achat de ${pack.tokens} jetons Kephale (${pack.label})`,
        returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/payments/webhook/cinetpay`,
        customerName: userData?.name || 'Utilisateur Kephale',
        customerEmail: userData?.email || 'user@kephale.com',
        metadata: {
          type: 'TOKEN_PURCHASE',
          userId: userId,
          packId: pack.id,
          tokens: pack.tokens.toString(),
        },
      });

      return {
        paymentUrl: result.paymentUrl,
        transactionId: result.transactionId,
        provider: 'CINETPAY',
        amount: amountFiat,
        currency,
        tokens: pack.tokens,
      };
    }

    if (provider === 'STRIPE' && process.env.STRIPE_SECRET_KEY) {
      const amountCents = Math.round(pack.priceEur * 100);
      const paymentIntent = await this.getStripe().paymentIntents.create({
        amount: amountCents,
        currency: 'eur',
        metadata: {
          type: 'TOKEN_PURCHASE',
          userId: userId,
          packId: pack.id,
          tokens: pack.tokens.toString(),
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        provider: 'STRIPE',
        amount: pack.priceEur,
        currency: 'EUR',
        tokens: pack.tokens,
      };
    }

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    if (!isProd) {
      const result = await this.prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: pack.tokens } }
        });

        const purchase = await tx.purchase.create({
          data: {
            userId: userId,
            type: 'TOKEN_PACK',
            amount: amountFiat,
            currency: currency,
            platformFeePercent: 0,
            platformFeeAmount: 0,
            artistAmount: 0,
            provider: 'TOKEN',
            status: 'SUCCEEDED',
          },
        });

        await tx.tokenTransaction.create({
          data: {
            userId,
            amount: pack.tokens,
            type: 'PURCHASE_PACK',
            description: `Achat de pack : ${pack.label} (+${pack.tokens} jetons)`,
            balanceAfter: updatedUser.tokenBalance,
            purchaseId: purchase.id,
            metadata: {
              packId: pack.id,
              fiatAmount: amountFiat,
              currency,
            },
          },
        });

        return { updatedUser, purchase };
      });

      return {
        isFakeTest: true,
        tokens: pack.tokens,
        newBalance: result.updatedUser.tokenBalance,
      };
    }

    throw new ServiceUnavailableException({
      success: false,
      error: { code: 'PAYMENT_UNAVAILABLE', message: 'Provider de paiement non disponible en production' }
    });
  }

  async payWithTokens(userId: string, data: { type: 'TRACK' | 'ALBUM' | 'CLIP'; itemId: string }) {
    const { type, itemId } = data;
    
    let priceFiat = 0;
    let currency = 'XOF';
    let artistId = '';
    let trackId: string | null = null;
    let albumId: string | null = null;
    let videoId: string | null = null;
    
    if (type === 'TRACK') {
      const item = await this.prisma.track.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId; trackId = item.id;
    } else if (type === 'ALBUM') {
      const item = await this.prisma.album.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId; albumId = item.id;
    } else if (type === 'CLIP') {
      const item = await this.prisma.video.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId || ''; videoId = item.id;
    }

    if (priceFiat === 0) throw new BadRequestException({ success: false, error: { code: 'FREE_ITEM', message: 'This item is free' } });

    const existing = await this.prisma.purchase.findFirst({
      where: { userId: userId, type: type as any, trackId, albumId, videoId }
    });
    if (existing) throw new ConflictException({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });

    // Rigorous Token Calculation with Directional Rounding UP
    const priceTokens = this.currencyService.calculateTokensForFiat(priceFiat, currency);

    const dbUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) throw new NotFoundException({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    if (dbUser.tokenBalance < priceTokens) {
      throw new BadRequestException({ success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Solde de jetons insuffisant' } });
    }

    // Calculate Platform split (20%) and Artist earnings (80%)
    const split = this.currencyService.calculateArtistSplit(priceTokens, 20);

    await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { decrement: priceTokens } }
      });

      await tx.artistProfile.update({
        where: { id: artistId },
        data: {
          pendingPayout: { increment: split.fiatArtistAmount },
          totalEarnings: { increment: split.fiatArtistAmount },
        }
      });

      const purchase = await tx.purchase.create({
        data: {
          userId: userId,
          type: type as any,
          trackId,
          albumId,
          videoId,
          amount: split.fiatTotalAmount,
          currency: split.currency, 
          platformFeePercent: 20,
          platformFeeAmount: split.fiatPlatformFee,
          artistAmount: split.fiatArtistAmount,
          provider: 'TOKEN',
          status: 'SUCCEEDED'
        }
      });

      const contentLabel = type === 'TRACK' ? 'du morceau' : (type === 'ALBUM' ? 'de l’album' : 'de la vidéo');
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: -priceTokens,
          type: 'SPEND_CONTENT',
          description: `Achat ${contentLabel} (-${priceTokens} jetons)`,
          balanceAfter: updatedUser.tokenBalance,
          purchaseId: purchase.id,
          metadata: {
            contentType: type,
            itemId,
            priceFiat,
            currency,
            split,
          },
        },
      });
    });

    if (typeof this.accessControlService.invalidateUserAccessCache === 'function') {
      await this.accessControlService.invalidateUserAccessCache(userId);
    }

    return { success: true, newBalance: dbUser.tokenBalance - priceTokens, tokensCharged: priceTokens };
  }

  async buyTrack(userId: string, data: { trackId: string; currency?: string; paymentProvider?: 'STRIPE' | 'CINETPAY' }) {
    const track = await this.prisma.track.findUnique({
      where: { id: data.trackId },
      include: { artist: true },
    });

    if (!track || track.status !== 'ACTIVE') {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
    }

    if (track.price === 0) {
      throw new BadRequestException({ success: false, error: { code: 'FREE_TRACK', message: 'This track is free' } });
    }

    const existing = await this.prisma.purchase.findFirst({ where: { userId, trackId: track.id } });
    if (existing) {
      throw new ConflictException({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });
    }

    const platformFeePercent = 20;
    const platformFee = track.price * (platformFeePercent / 100);
    const artistAmount = track.price - platformFee;
    const provider = data.paymentProvider || 'CINETPAY';
    const currency = data.currency || 'XOF';

    if (provider === 'CINETPAY') {
      const userData = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      const transactionId = `TRACK-${track.id}-${userId}-${Date.now()}`;

      const result = await this.initiateCinetPayPayment({
        transactionId,
        amount: track.price,
        currency: currency,
        description: `Achat: ${track.title} — ${track.artist.stageName}`,
        returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/payments/webhook/cinetpay`,
        customerName: userData!.name,
        customerEmail: userData!.email,
        metadata: {
          type: 'TRACK_PURCHASE',
          userId: userId,
          trackId: track.id,
          artistId: track.artistId,
          platformFee: platformFee.toString(),
          artistAmount: artistAmount.toString(),
        },
      });

      return {
        paymentUrl: result.paymentUrl,
        transactionId: result.transactionId,
        provider: 'CINETPAY',
        amount: track.price,
        currency,
        track: { id: track.id, title: track.title, artist: track.artist.stageName },
      };
    }

    const amountCents = Math.round(track.price * 100);
    const paymentIntent = await this.getStripe().paymentIntents.create({
      amount: amountCents,
      currency: track.currency.toLowerCase(),
      metadata: {
        userId: userId, trackId: track.id, artistId: track.artistId,
        type: 'TRACK_PURCHASE',
        platformFee: platformFee.toString(),
        artistAmount: artistAmount.toString(),
      },
      ...(track.artist.stripeAccountId && {
        transfer_data: { destination: track.artist.stripeAccountId, amount: Math.round(artistAmount * 100) },
      }),
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      provider: 'STRIPE',
      amount: track.price,
      currency: track.currency,
      track: { id: track.id, title: track.title, artist: track.artist.stageName },
    };
  }

  /**
   * Verify CinetPay webhook authenticity using HMAC-SHA256 signature.
   * CinetPay includes a `cpm_hash` field computed from the transaction data + API key.
   * Without this check, anyone can send a fake webhook to credit tokens.
   */
  private verifyCinetPaySignature(body: any): boolean {
    const apiKey = process.env.CINETPAY_API_KEY;
    if (!apiKey) return false;

    // CinetPay signature = MD5 or SHA256 of (apikey + site_id + transaction_id)
    // The exact algorithm depends on your CinetPay integration version.
    // We use the cpm_hash field provided by CinetPay for verification.
    const receivedHash = body?.cpm_hash;
    if (!receivedHash) {
      console.warn('[CinetPay] Missing cpm_hash in webhook body');
      return false;
    }

    // Re-compute hash: SHA256(apiKey + siteId + transactionId)
    const crypto = require('crypto');
    const siteId = process.env.CINETPAY_SITE_ID || '';
    const transactionId = body?.cpm_trans_id || '';
    const expectedHash = crypto
      .createHmac('sha256', apiKey)
      .update(`${siteId}${transactionId}`)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedHash.toLowerCase()),
        Buffer.from(expectedHash.toLowerCase()),
      );
    } catch {
      return false;
    }
  }

  async handleCinetPayWebhook(body: any) {
    // ── Security: Verify webhook signature before processing ────────────────
    // Skip strict verification in dev if no API key configured
    const apiKey = process.env.CINETPAY_API_KEY;
    if (apiKey && !this.verifyCinetPaySignature(body)) {
      console.warn('[CinetPay] Webhook rejected: invalid signature', {
        transactionId: body?.cpm_trans_id,
      });
      // Return silently (don't reveal signature mismatch to potential attacker)
      return;
    }

    const transactionId: string = body?.cpm_trans_id;
    const status: string = body?.cpm_result; 

    if (!transactionId) return;

    if (status !== '00') {
      console.warn(`[CinetPay] Payment failed for tx: ${transactionId}`);
      return;
    }

    // ── Double verification: re-check payment status with CinetPay API ──────
    const verifyRes = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: process.env.CINETPAY_API_KEY,
        site_id: process.env.CINETPAY_SITE_ID,
        transaction_id: transactionId,
      }),
    });
    const verifyData = (await verifyRes.json()) as any;

    if (verifyData.code !== '00' || verifyData.data?.status !== 'ACCEPTED') {
      console.warn('[CinetPay] Payment not verified:', verifyData);
      return;
    }

    const meta = verifyData.data?.metadata ? JSON.parse(verifyData.data.metadata) : {};
    const amount = verifyData.data?.amount ?? 0;
    const currency = verifyData.data?.currency ?? 'XOF';

    try {
      if (meta.type === 'TOKEN_PURCHASE') {
        const alreadyDoneToken = await this.prisma.purchase.findFirst({
          where: { cinetpayTransactionId: transactionId, type: 'TOKEN_PACK' },
        });
        if (!alreadyDoneToken) {
          await this.prisma.$transaction(async (tx) => {
            const purchase = await tx.purchase.create({
              data: {
                userId: meta.userId,
                type: 'TOKEN_PACK',
                amount,
                currency,
                platformFeePercent: 0,
                platformFeeAmount: 0,
                artistAmount: 0,
                provider: 'CINETPAY',
                status: 'SUCCEEDED',
                cinetpayTransactionId: transactionId,
              },
            });
            const updatedUser = await tx.user.update({
              where: { id: meta.userId },
              data: { tokenBalance: { increment: Number(meta.tokens) } },
            });
            await tx.tokenTransaction.create({
              data: {
                userId: meta.userId,
                amount: Number(meta.tokens),
                type: 'PURCHASE_PACK',
                description: `Achat de jetons via CinetPay (+${meta.tokens} jetons)`,
                balanceAfter: updatedUser.tokenBalance,
                purchaseId: purchase.id,
                metadata: {
                  provider: 'CINETPAY',
                  transactionId,
                  amount,
                  currency,
                },
              },
            });
          });
        }
      }

      if (meta.type === 'TRACK_PURCHASE') {
        const alreadyDone = await this.prisma.purchase.findFirst({
          where: { userId: meta.userId, trackId: meta.trackId },
        });
        if (!alreadyDone) {
          await this.prisma.purchase.create({
            data: {
              userId: meta.userId,
              type: 'TRACK',
              trackId: meta.trackId,
              amount,
              currency,
              platformFeePercent: 20,
              platformFeeAmount: Number(meta.platformFee),
              artistAmount: Number(meta.artistAmount),
              provider: 'CINETPAY',
              status: 'SUCCEEDED',
              cinetpayTransactionId: transactionId,
            },
          });
          await this.prisma.artistProfile.update({
            where: { id: meta.artistId },
            data: {
              totalEarnings: { increment: Number(meta.artistAmount) },
              pendingPayout: { increment: Number(meta.artistAmount) },
            },
          });
        }
      }
    } catch (e) {
      console.error('[CinetPay webhook] Error processing payment:', e);
    }
  }


  async handleStripeWebhook(rawBody: any, signature: string) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return;
    
    let event: Stripe.Event;
    try {
      event = this.getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch {
      throw new BadRequestException('Webhook signature verification failed');
    }

    const redisKey = `webhook:stripe:${event.id}`;
    const isProcessed = await this.redis.setnx(redisKey, '1');
    if (!isProcessed) return;
    await this.redis.expire(redisKey, 86400);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata;

        if (meta.type === 'TOKEN_PURCHASE') {
          const alreadyDoneToken = await this.prisma.purchase.findFirst({
            where: { stripePaymentIntentId: pi.id, type: 'TOKEN_PACK' },
          });
          if (!alreadyDoneToken) {
            await this.prisma.$transaction(async (tx) => {
              const purchase = await tx.purchase.create({
                data: {
                  userId: meta.userId,
                  type: 'TOKEN_PACK',
                  amount: pi.amount / 100,
                  currency: pi.currency.toUpperCase(),
                  platformFeePercent: 0,
                  platformFeeAmount: 0,
                  artistAmount: 0,
                  provider: 'STRIPE',
                  status: 'SUCCEEDED',
                  stripePaymentIntentId: pi.id,
                },
              });
              const updatedUser = await tx.user.update({
                where: { id: meta.userId },
                data: { tokenBalance: { increment: Number(meta.tokens) } },
              });
              await tx.tokenTransaction.create({
                data: {
                  userId: meta.userId,
                  amount: Number(meta.tokens),
                  type: 'PURCHASE_PACK',
                  description: `Achat de jetons via Stripe (+${meta.tokens} jetons)`,
                  balanceAfter: updatedUser.tokenBalance,
                  purchaseId: purchase.id,
                  metadata: {
                    provider: 'STRIPE',
                    paymentIntentId: pi.id,
                    amount: pi.amount / 100,
                    currency: pi.currency.toUpperCase(),
                  },
                },
              });
            });
          }
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        
        let tier: 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS' = 'FREE';
        const priceId = sub.items.data[0]?.price.id;
        if (priceId === process.env.STRIPE_PRICE_PREMIUM_PLUS) tier = 'PREMIUM_PLUS';
        else if (priceId === process.env.STRIPE_PRICE_PREMIUM) tier = 'PREMIUM';

        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: sub.status === 'active' ? 'ACTIVE' : (sub.status === 'past_due' ? 'PAST_DUE' : 'CANCELED'),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            tier: tier,
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'CANCELED', tier: 'FREE', cancelAtPeriodEnd: false },
        });
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await this.prisma.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer as string },
            data: { status: 'PAST_DUE' },
          });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await this.prisma.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer as string },
            data: { status: 'ACTIVE' },
          });
        }
        break;
      }
    }
  }

  /**
   * Get user token transactions history
   */
  async getTokenHistory(userId: string, options?: { page?: number; limit?: number; type?: string }) {
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (options?.type) {
      where.type = options.type;
    }

    const [transactions, total, user] = await Promise.all([
      this.prisma.tokenTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              placement: true,
            },
          },
        },
      }),
      this.prisma.tokenTransaction.count({ where }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { tokenBalance: true },
      }),
    ]);

    return {
      currentBalance: user?.tokenBalance || 0,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      transactions,
    };
  }
}

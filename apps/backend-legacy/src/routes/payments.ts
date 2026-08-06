import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { AccessControlService } from '../services/access.service.js';
import { z } from 'zod';

// Lazy Stripe singleton — avoids crash at startup if key not yet configured
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured in .env');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
  }
  return _stripe;
}

const BuyTokensSchema = z.object({
  packId: z.string(),
  currency: z.string().default('XOF'),
  paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
});

const BuyTrackSchema = z.object({
  trackId: z.string(),
  currency: z.string().default('XOF'),
  paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
});

const BuyAlbumSchema = z.object({
  albumId: z.string(),
  currency: z.string().default('XOF'),
  paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
});

const BuyVideoSchema = z.object({
  videoId: z.string(),
  currency: z.string().default('XOF'),
  paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
});

const PayWithTokensSchema = z.object({
  type: z.enum(['TRACK', 'ALBUM', 'CLIP']),
  itemId: z.string(),
});

// ── CinetPay helper ───────────────────────────────────────────────────────────

async function initiateCinetPayPayment(params: {
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

export async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/payments/token-packs
   * List available token packs (avec auto-seeding si vide)
   *
   * Taux de référence : 1 Jeton = 10 FCFA = 0.015 EUR
   */
  fastify.get('/token-packs', async (request, reply) => {
    let packs = await prisma.tokenPack.findMany({
      where: { isActive: true },
      orderBy: { tokens: 'asc' },
    });

    // Auto-seeding si la base de données ne contient aucun pack (Taux uniforme 1 Jeton = 10 FCFA = 0.015 EUR)
    if (packs.length === 0) {
      const defaultPacks = [
        { tokens: 100, priceEur: 1.50, label: 'Starter', isBestValue: false },  // 1 000 FCFA
        { tokens: 500, priceEur: 7.50, label: 'Populaire', isBestValue: true },  // 5 000 FCFA
        { tokens: 1200, priceEur: 15.00, label: 'Pro', isBestValue: false },     // 10 000 FCFA (+200 bonus)
        { tokens: 3500, priceEur: 45.00, label: 'VIP', isBestValue: false },     // 30 000 FCFA (+500 bonus)
      ];
      await prisma.tokenPack.createMany({ data: defaultPacks });
      packs = await prisma.tokenPack.findMany({
        where: { isActive: true },
        orderBy: { tokens: 'asc' },
      });
    }

    return reply.send({ success: true, data: packs });
  });

  /**
   * POST /api/v1/payments/buy-tokens
   * Purchase a token pack via CinetPay (Mobile Money) or Stripe (Card)
   */
  fastify.post('/buy-tokens', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = BuyTokensSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });

    const pack = await prisma.tokenPack.findUnique({ where: { id: body.data.packId } });
    if (!pack) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Pack de jetons introuvable' } });

    const provider = body.data.paymentProvider || 'CINETPAY';
    const currency = body.data.currency || 'XOF';

    // Calcul du montant fiat selon la devise demandée (1 EUR = 655.957 FCFA)
    let amountFiat = Math.round(pack.priceEur * 655.957);
    if (currency === 'EUR') amountFiat = pack.priceEur;
    else if (currency === 'USD') amountFiat = Number((pack.priceEur * 1.08).toFixed(2));

    // ── 1. CinetPay (Mobile Money — Orange, MTN, Wave, Free) ──────────────────────
    if (provider === 'CINETPAY' && process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) {
      const userData = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true, name: true } });
      const transactionId = `TOKEN-${pack.id}-${user.userId}-${Date.now()}`;

      const result = await initiateCinetPayPayment({
        transactionId,
        amount: amountFiat,
        currency,
        description: `Achat de ${pack.tokens} jetons Kephale (${pack.label})`,
        returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/v1/payments/webhook/cinetpay`,
        customerName: userData?.name || 'Utilisateur Kephale',
        customerEmail: userData?.email || 'user@kephale.com',
        metadata: {
          type: 'TOKEN_PURCHASE',
          userId: user.userId,
          packId: pack.id,
          tokens: pack.tokens.toString(),
        },
      });

      return reply.send({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          transactionId: result.transactionId,
          provider: 'CINETPAY',
          amount: amountFiat,
          currency,
          tokens: pack.tokens,
        },
      });
    }

    // ── 2. Stripe (Cartes Bancaires) ─────────────────────────────────────────────
    if (provider === 'STRIPE' && process.env.STRIPE_SECRET_KEY) {
      const amountCents = Math.round(pack.priceEur * 100);
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: amountCents,
        currency: 'eur',
        metadata: {
          type: 'TOKEN_PURCHASE',
          userId: user.userId,
          packId: pack.id,
          tokens: pack.tokens.toString(),
        },
      });

      return reply.send({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          provider: 'STRIPE',
          amount: pack.priceEur,
          currency: 'EUR',
          tokens: pack.tokens,
        },
      });
    }

    // ── 3. Mode Simulation Dev / Test (quand clés API non configurées) ─────────────
    if (process.env.NODE_ENV !== 'production') {
      const updatedUser = await prisma.user.update({
        where: { id: user.userId },
        data: { tokenBalance: { increment: pack.tokens } }
      });

      await prisma.purchase.create({
        data: {
          userId: user.userId,
          type: 'TOKEN_PACK',
          amount: Math.round(pack.priceEur * 655),
          currency: 'XOF',
          platformFeePercent: 0,
          platformFeeAmount: 0,
          artistAmount: 0,
          provider: 'TOKEN',
          status: 'SUCCEEDED',
        },
      });

      return reply.send({
        success: true,
        data: {
          isFakeTest: true,
          tokens: pack.tokens,
          newBalance: updatedUser.tokenBalance,
        },
      });
    }

    return reply.status(503).send({
      success: false,
      error: { code: 'PAYMENT_UNAVAILABLE', message: 'Provider de paiement non disponible en production' }
    });
  });

  /**
   * POST /api/v1/payments/pay-with-tokens
   * Purchase an item using user's virtual tokens
   */
  fastify.post('/pay-with-tokens', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = PayWithTokensSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });

    const { type, itemId } = body.data;
    
    // Find item
    let priceFiat = 0;
    let currency = 'XOF';
    let artistId = '';
    let trackId = null;
    let albumId = null;
    let videoId = null;
    
    if (type === 'TRACK') {
      const item = await prisma.track.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId; trackId = item.id;
    } else if (type === 'ALBUM') {
      const item = await prisma.album.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId; albumId = item.id;
    } else if (type === 'CLIP') {
      const item = await prisma.video.findUnique({ where: { id: itemId } });
      if (!item || item.status !== 'ACTIVE') return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      priceFiat = item.price; currency = item.currency; artistId = item.artistId || ''; videoId = item.id;
    }

    if (priceFiat === 0) return reply.status(400).send({ success: false, error: { code: 'FREE_ITEM', message: 'This item is free' } });

    // Check if already purchased
    const existing = await prisma.purchase.findFirst({
      where: { userId: user.userId, type: type as any, trackId, albumId, videoId }
    });
    if (existing) return reply.status(409).send({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });

    // Calculate Token Price
    let priceTokens = 0;
    if (currency === 'XOF' || currency === 'FCFA') {
      priceTokens = Math.ceil(priceFiat / 10);
    } else if (currency === 'EUR') {
      priceTokens = Math.ceil(priceFiat / 0.015);
    } else if (currency === 'USD') {
      priceTokens = Math.ceil(priceFiat / 0.016);
    } else {
      priceTokens = Math.ceil(priceFiat / 0.015);
    }

    // Check user balance
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    if (dbUser.tokenBalance < priceTokens) {
      return reply.status(400).send({ success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Solde de jetons insuffisant' } });
    }

    const platformFeeTokens = Math.ceil(priceTokens * 0.20);
    const artistTokens = priceTokens - platformFeeTokens;
    
    // Convert tokens to fiat (XOF) for the artist's balance
    // 1 Token = 10 XOF
    const fiatArtistAmount = artistTokens * 10;
    const fiatPlatformFee = platformFeeTokens * 10;
    const fiatTotalAmount = priceTokens * 10;

    // Execute Transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.userId },
        data: { tokenBalance: { decrement: priceTokens } }
      });

      await tx.artistProfile.update({
        where: { id: artistId },
        data: { pendingPayout: { increment: fiatArtistAmount }, totalEarnings: { increment: fiatArtistAmount } }
      });

      await tx.purchase.create({
        data: {
          userId: user.userId,
          type: type as any,
          trackId,
          albumId,
          videoId,
          amount: fiatTotalAmount,
          currency: 'XOF', // Store in fiat for accounting consistency
          platformFeePercent: 20,
          platformFeeAmount: fiatPlatformFee,
          artistAmount: fiatArtistAmount,
          provider: 'TOKEN',
          status: 'SUCCEEDED'
        }
      });
    });

    // Invalidate access cache so user gets immediate stream access without waiting for 5 min Redis TTL
    await AccessControlService.invalidateUserAccessCache(user.userId);

    return reply.send({ success: true, data: { success: true, newBalance: dbUser.tokenBalance - priceTokens } });
  });

  /**
   * POST /api/v1/payments/buy-track
   * Purchase a track (Stripe or CinetPay)
   */
  fastify.post('/buy-track', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = BuyTrackSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });

    const track = await prisma.track.findUnique({
      where: { id: body.data.trackId },
      include: { artist: true },
    });

    if (!track || track.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Track not found' } });
    }

    if (track.price === 0) {
      return reply.status(400).send({ success: false, error: { code: 'FREE_TRACK', message: 'This track is free' } });
    }

    // Check already purchased
    const existing = await prisma.purchase.findFirst({ where: { userId: user.userId, trackId: track.id } });
    if (existing) {
      return reply.status(409).send({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });
    }

    const platformFeePercent = 20;
    const platformFee = track.price * (platformFeePercent / 100);
    const artistAmount = track.price - platformFee;

    // CinetPay (Mobile Money — primary for West Africa)
    if (body.data.paymentProvider === 'CINETPAY') {
      const userData = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true, name: true } });
      const transactionId = `TRACK-${track.id}-${user.userId}-${Date.now()}`;

      const result = await initiateCinetPayPayment({
        transactionId,
        amount: track.price,
        currency: body.data.currency,
        description: `Achat: ${track.title} — ${track.artist.stageName}`,
        returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/v1/payments/webhook/cinetpay`,
        customerName: userData!.name,
        customerEmail: userData!.email,
        metadata: {
          type: 'TRACK_PURCHASE',
          userId: user.userId,
          trackId: track.id,
          artistId: track.artistId,
          platformFee: platformFee.toString(),
          artistAmount: artistAmount.toString(),
        },
      });

      return reply.send({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          transactionId: result.transactionId,
          provider: 'CINETPAY',
          amount: track.price,
          currency: body.data.currency,
          track: { id: track.id, title: track.title, artist: track.artist.stageName },
        },
      });
    }

    // Stripe fallback (international cards)
    const amountCents = Math.round(track.price * 100);
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: track.currency.toLowerCase(),
      metadata: {
        userId: user.userId, trackId: track.id, artistId: track.artistId,
        type: 'TRACK_PURCHASE',
        platformFee: platformFee.toString(),
        artistAmount: artistAmount.toString(),
      },
      ...(track.artist.stripeAccountId && {
        transfer_data: { destination: track.artist.stripeAccountId, amount: Math.round(artistAmount * 100) },
      }),
    });

    return reply.send({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        provider: 'STRIPE',
        amount: track.price,
        currency: track.currency,
        track: { id: track.id, title: track.title, artist: track.artist.stageName },
      },
    });
  });

  /**
   * POST /api/v1/payments/buy-album
   * Purchase a full album (CinetPay or Stripe)
   */
  fastify.post('/buy-album', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = BuyAlbumSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });

    const album = await prisma.album.findUnique({
      where: { id: body.data.albumId },
      include: { artist: true },
    });

    if (!album || album.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Album not found' } });
    }

    if (album.price === 0) {
      return reply.status(400).send({ success: false, error: { code: 'FREE_ALBUM', message: 'This album is free' } });
    }

    const existing = await prisma.purchase.findFirst({ where: { userId: user.userId, albumId: album.id } });
    if (existing) {
      return reply.status(409).send({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });
    }

    const platformFeePercent = 20;
    const platformFee = album.price * (platformFeePercent / 100);
    const artistAmount = album.price - platformFee;

    if (body.data.paymentProvider === 'CINETPAY') {
      const userData = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true, name: true } });
      const transactionId = `ALBUM-${album.id}-${user.userId}-${Date.now()}`;

      const result = await initiateCinetPayPayment({
        transactionId,
        amount: album.price,
        currency: body.data.currency,
        description: `Achat album: ${album.title} — ${album.artist.stageName}`,
        returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/v1/payments/webhook/cinetpay`,
        customerName: userData!.name,
        customerEmail: userData!.email,
        metadata: {
          type: 'ALBUM_PURCHASE',
          userId: user.userId,
          albumId: album.id,
          artistId: album.artistId,
          platformFee: platformFee.toString(),
          artistAmount: artistAmount.toString(),
        },
      });

      return reply.send({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          transactionId: result.transactionId,
          provider: 'CINETPAY',
          amount: album.price,
          currency: body.data.currency,
          album: { id: album.id, title: album.title, artist: album.artist.stageName },
        },
      });
    }

    return reply.status(400).send({ success: false, error: { code: 'UNSUPPORTED_PROVIDER', message: 'Use CINETPAY for album purchases' } });
  });

  /**
   * POST /api/v1/payments/buy-video
   * Purchase a video/clip (CinetPay or Stripe)
   */
  fastify.post('/buy-video', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const body = BuyVideoSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });

    const video = await prisma.video.findUnique({
      where: { id: body.data.videoId },
      include: { artist: true },
    });

    if (!video || video.status !== 'ACTIVE') {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } });
    }

    if (!video.artist || !video.artistId) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_VIDEO', message: 'Video has no associated artist' } });
    }

    if (video.price === 0) {
      return reply.status(400).send({ success: false, error: { code: 'FREE_VIDEO', message: 'This video is free' } });
    }

    const existing = await prisma.purchase.findFirst({ where: { userId: user.userId, videoId: video.id } });
    if (existing) {
      return reply.status(409).send({ success: false, error: { code: 'ALREADY_PURCHASED', message: 'Already purchased' } });
    }

    const platformFeePercent = 20;
    const platformFee = video.price * (platformFeePercent / 100);
    const artistAmount = video.price - platformFee;

    if (body.data.paymentProvider === 'CINETPAY') {
      const userData = await prisma.user.findUnique({ where: { id: user.userId }, select: { email: true, name: true } });
      const transactionId = `VIDEO-${video.id}-${user.userId}-${Date.now()}`;

      const result = await initiateCinetPayPayment({
        transactionId,
        amount: video.price,
        currency: body.data.currency,
        description: `Achat vidéo: ${video.title} — ${video.artist.stageName}`,
        returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
        notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/v1/payments/webhook/cinetpay`,
        customerName: userData!.name,
        customerEmail: userData!.email,
        metadata: {
          type: 'VIDEO_PURCHASE',
          userId: user.userId,
          videoId: video.id,
          artistId: video.artistId,
          platformFee: platformFee.toString(),
          artistAmount: artistAmount.toString(),
        },
      });

      return reply.send({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          transactionId: result.transactionId,
          provider: 'CINETPAY',
          amount: video.price,
          currency: body.data.currency,
          video: { id: video.id, title: video.title, artist: video.artist.stageName },
        },
      });
    }

    // Stripe fallback
    const amountCents = Math.round(video.price * 100);
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: video.currency.toLowerCase(),
      metadata: {
        userId: user.userId, videoId: video.id, artistId: video.artistId,
        type: 'VIDEO_PURCHASE',
        platformFee: platformFee.toString(),
        artistAmount: artistAmount.toString(),
      },
      ...(video.artist.stripeAccountId && {
        transfer_data: { destination: video.artist.stripeAccountId, amount: Math.round(artistAmount * 100) },
      }),
    });

    return reply.send({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        provider: 'STRIPE',
        amount: video.price,
        currency: video.currency,
        video: { id: video.id, title: video.title, artist: video.artist.stageName },
      },
    });
  });

  /**
   * POST /api/v1/payments/webhook/cinetpay
   * Receive CinetPay payment confirmation (IPN webhook)
   */
  fastify.post('/webhook/cinetpay', async (request, reply) => {
    const body = request.body as any;
    const transactionId: string = body?.cpm_trans_id;
    const status: string = body?.cpm_result; // '00' = success

    if (!transactionId) return reply.status(400).send({ error: 'Missing transaction ID' });

    if (status !== '00') {
      console.warn(`[CinetPay] Payment failed for tx: ${transactionId}`);
      return reply.send({ received: true });
    }

    // Verify with CinetPay API
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
      return reply.send({ received: true });
    }

    const meta = verifyData.data?.metadata ? JSON.parse(verifyData.data.metadata) : {};
    const amount = verifyData.data?.amount ?? 0;
    const currency = verifyData.data?.currency ?? 'XOF';

    try {
      if (meta.type === 'TOKEN_PURCHASE') {
        const alreadyDoneToken = await prisma.purchase.findFirst({
          where: { cinetpayTransactionId: transactionId, type: 'TOKEN_PACK' },
        });
        if (!alreadyDoneToken) {
          await prisma.$transaction([
            prisma.purchase.create({
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
            }),
            prisma.user.update({
              where: { id: meta.userId },
              data: { tokenBalance: { increment: Number(meta.tokens) } },
            }),
          ]);
        }
      }

      if (meta.type === 'TRACK_PURCHASE') {
        const alreadyDone = await prisma.purchase.findFirst({
          where: { userId: meta.userId, trackId: meta.trackId },
        });
        if (!alreadyDone) {
          await prisma.purchase.create({
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
          // Increment artist pendingPayout
          await prisma.artistProfile.update({
            where: { id: meta.artistId },
            data: {
              totalEarnings: { increment: Number(meta.artistAmount) },
              pendingPayout: { increment: Number(meta.artistAmount) },
            },
          });
        }
      }

      if (meta.type === 'ALBUM_PURCHASE') {
        const alreadyDone = await prisma.purchase.findFirst({
          where: { userId: meta.userId, albumId: meta.albumId },
        });
        if (!alreadyDone) {
          await prisma.purchase.create({
            data: {
              userId: meta.userId,
              type: 'ALBUM',
              albumId: meta.albumId,
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
          await prisma.artistProfile.update({
            where: { id: meta.artistId },
            data: {
              totalEarnings: { increment: Number(meta.artistAmount) },
              pendingPayout: { increment: Number(meta.artistAmount) },
            },
          });
        }
      }

      if (meta.type === 'VIDEO_PURCHASE') {
        const alreadyDone = await prisma.purchase.findFirst({
          where: { userId: meta.userId, videoId: meta.videoId },
        });
        if (!alreadyDone) {
          await prisma.purchase.create({
            data: {
              userId: meta.userId,
              type: 'CLIP',
              videoId: meta.videoId,
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
          await prisma.artistProfile.update({
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

    return reply.send({ received: true });
  });

  /**
   * POST /api/v1/payments/webhook/stripe
   * Handle Stripe webhook events
   */
  fastify.post('/webhook/stripe', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = getStripe().webhooks.constructEvent(
        (request as any).rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch {
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata;

        if (meta.type === 'TOKEN_PURCHASE') {
          // Idempotence: vérifier si l'achat n'existe pas déjà (double envoi Stripe possible)
          const alreadyDoneToken = await prisma.purchase.findFirst({
            where: { stripePaymentIntentId: pi.id, type: 'TOKEN_PACK' },
          });
          if (!alreadyDoneToken) {
            await prisma.$transaction([
              prisma.purchase.create({
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
              }),
              prisma.user.update({
                where: { id: meta.userId },
                data: { tokenBalance: { increment: Number(meta.tokens) } },
              }),
            ]);
          }
        }

        if (meta.type === 'TRACK_PURCHASE') {
          // Idempotence: vérifier si l'achat n'existe pas déjà
          const alreadyDone = await prisma.purchase.findFirst({
            where: { userId: meta.userId, trackId: meta.trackId, provider: 'STRIPE' },
          });
          if (!alreadyDone) {
            await prisma.purchase.create({
              data: {
                userId: meta.userId,
                type: 'TRACK',
                trackId: meta.trackId,
                amount: pi.amount / 100,
                currency: pi.currency.toUpperCase(),
                platformFeePercent: 20,
                platformFeeAmount: Number(meta.platformFee),
                artistAmount: Number(meta.artistAmount),
                provider: 'STRIPE',
                status: 'SUCCEEDED',
                stripePaymentIntentId: pi.id,
              },
            });
            await prisma.artistProfile.update({
              where: { id: meta.artistId },
              data: {
                totalEarnings: { increment: Number(meta.artistAmount) },
                pendingPayout: { increment: Number(meta.artistAmount) },
              },
            });
          }
        }
        
        if (meta.type === 'VIDEO_PURCHASE') {
          // Idempotence: vérifier si l'achat n'existe pas déjà
          const alreadyDoneVideo = await prisma.purchase.findFirst({
            where: { userId: meta.userId, videoId: meta.videoId, provider: 'STRIPE' },
          });
          if (!alreadyDoneVideo) {
            await prisma.purchase.create({
              data: {
                userId: meta.userId,
                type: 'CLIP',
                videoId: meta.videoId,
                amount: pi.amount / 100,
                currency: pi.currency.toUpperCase(),
                platformFeePercent: 20,
                platformFeeAmount: Number(meta.platformFee),
                artistAmount: Number(meta.artistAmount),
                provider: 'STRIPE',
                status: 'SUCCEEDED',
                stripePaymentIntentId: pi.id,
              },
            });
            await prisma.artistProfile.update({
              where: { id: meta.artistId },
              data: {
                totalEarnings: { increment: Number(meta.artistAmount) },
                pendingPayout: { increment: Number(meta.artistAmount) },
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'CANCELED', tier: 'FREE' },
        });
        break;
      }
    }

    return reply.send({ received: true });
  });
}

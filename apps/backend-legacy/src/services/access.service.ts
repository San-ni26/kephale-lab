import { prisma } from '@kephale/database';
import { redis } from '../lib/redis.js';

const ACCESS_CACHE_TTL = 300; // 5 minutes de cache pour les vérifications d'accès

export class AccessControlService {
  private static QUOTAS = {
    PREMIUM: 50,
    PREMIUM_PLUS: 500, // ou illimité
  };

  /**
   * Vérifie et consomme potentiellement un quota d'abonnement.
   * Retourne true si l'accès est accordé via abonnement.
   */
  private static async checkAndConsumeSubscriptionQuota(userId: string): Promise<boolean> {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub || sub.status !== 'ACTIVE') return false;

    const now = new Date();
    // Invalider si la période est expirée
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
      return false;
    }

    const quota = this.QUOTAS[sub.tier as keyof typeof this.QUOTAS];

    // Pour FREE ou tiers non reconnus
    if (!quota) return false;

    if (sub.paidStreamsUsed < quota) {
      // Consommer le quota (1 jeton virtuel d'abonnement)
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { paidStreamsUsed: { increment: 1 } },
      });
      return true;
    }

    return false; // Quota épuisé
  }

  /**
   * Vérifie si un utilisateur peut accéder à un track payant.
   * Ordre : gratuit → auteur → achat valide (status=SUCCEEDED) → abonnement → refusé
   */
  /**
   * Vérifie si un utilisateur peut accéder à un track payant.
   * Ordre : gratuit → auteur → achat valide (status=SUCCEEDED) → abonnement → refusé
   */
  static async canAccessTrack(userId: string, track: any): Promise<boolean> {
    if (!track.price || track.price <= 0) return true;

    const cacheKey = `access:track:${userId}:${track.id}`;

    // 1. Toujours vérifier la présence d'un achat direct en base pour contourner un éventuel cache négatif obsolète
    const orConditions: any[] = [{ userId, trackId: track.id, status: 'SUCCEEDED' }];
    if (track.albumId) {
      orConditions.push({ userId, albumId: track.albumId, status: 'SUCCEEDED' });
    }

    const purchase = await prisma.purchase.findFirst({
      where: { OR: orConditions },
    });

    if (purchase) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    // 2. Est-ce l'auteur ?
    const artist = await prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === track.artistId) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    // 3. Vérifier le cache si pas d'achat direct ou d'auteur
    try {
      const cached = await redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    // 4. Vérification de l'abonnement et du quota
    const hasAccess = await this.checkAndConsumeSubscriptionQuota(userId);

    try {
      await redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  /**
   * Vérifie si un utilisateur peut accéder à une vidéo payante.
   * Ordre : gratuit → auteur → achat valide (status=SUCCEEDED) → abonnement → refusé
   */
  static async canAccessVideo(userId: string, video: any): Promise<boolean> {
    if (!video.price || video.price <= 0) return true;

    const cacheKey = `access:video:${userId}:${video.id}`;

    const purchase = await prisma.purchase.findFirst({
      where: { userId, videoId: video.id, status: 'SUCCEEDED' },
    });

    if (purchase) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === video.artistId) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    try {
      const cached = await redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    const hasAccess = await this.checkAndConsumeSubscriptionQuota(userId);

    try {
      await redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  /**
   * Vérifie si un utilisateur peut accéder à un album payant.
   * Ordre : gratuit → auteur → achat valide (status=SUCCEEDED) → abonnement → refusé
   */
  static async canAccessAlbum(userId: string, album: any): Promise<boolean> {
    if (!album.price || album.price <= 0) return true;

    const cacheKey = `access:album:${userId}:${album.id}`;

    const purchase = await prisma.purchase.findFirst({
      where: { userId, albumId: album.id, status: 'SUCCEEDED' },
    });

    if (purchase) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    const artist = await prisma.artistProfile.findUnique({ where: { userId } });
    if (artist && artist.id === album.artistId) {
      try { await redis.setex(cacheKey, ACCESS_CACHE_TTL, '1'); } catch {}
      return true;
    }

    try {
      const cached = await redis.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {}

    let hasAccess = false;
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    const now = new Date();
    if (
      sub &&
      sub.status === 'ACTIVE' &&
      (sub.tier === 'PREMIUM' || sub.tier === 'PREMIUM_PLUS') &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd >= now)
    ) {
      const quota = this.QUOTAS[sub.tier as keyof typeof this.QUOTAS];
      if (quota && sub.paidStreamsUsed < quota) {
        hasAccess = true;
      }
    }

    try {
      await redis.setex(cacheKey, ACCESS_CACHE_TTL, hasAccess ? '1' : '0');
    } catch {}

    return hasAccess;
  }

  /**
   * Invalide le cache d'accès pour un utilisateur (après un achat, par exemple).
   */
  static async invalidateUserAccessCache(userId: string): Promise<void> {
    try {
      const keys = await redis.keys(`access:*:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {}
  }
}

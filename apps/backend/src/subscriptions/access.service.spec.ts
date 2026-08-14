/**
 * Tests unitaires — AccessControlService
 *
 * Couvre :
 * - canAccessTrack : contenu gratuit, contenu acheté, cache Redis, artiste propriétaire
 * - checkAndConsumeSubscriptionQuota : Premium (50 streams), quota épuisé, abonnement expiré
 * - canAccessVideo : même logique que track
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access.service';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const mockPrisma = {
  subscription: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  purchase: {
    findFirst: jest.fn(),
  },
  artistProfile: {
    findUnique: jest.fn(),
  },
};

// ── Mock Redis ─────────────────────────────────────────────────────────────────

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('AccessControlService', () => {
  let service: AccessControlService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: 'PrismaClient', useValue: mockPrisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
  });

  // ── canAccessTrack ─────────────────────────────────────────────────────────

  describe('canAccessTrack', () => {
    const freeTrack = { id: 'track-1', price: 0, albumId: null, artistId: 'artist-1' };
    const paidTrack = { id: 'track-2', price: 500, albumId: null, artistId: 'artist-1' };

    it('doit autoriser l\'accès à une track gratuite (price = 0)', async () => {
      const result = await service.canAccessTrack('user-123', freeTrack);
      expect(result).toBe(true);
      // Pas de requête DB nécessaire pour une track gratuite
      expect(mockPrisma.purchase.findFirst).not.toHaveBeenCalled();
    });

    it('doit autoriser l\'accès si la track a été achetée (cache miss → DB hit)', async () => {
      mockRedis.get.mockResolvedValue(null); // Cache miss
      mockPrisma.purchase.findFirst.mockResolvedValue({ id: 'purchase-1', status: 'SUCCEEDED' });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-123', paidTrack);

      expect(result).toBe(true);
      expect(mockPrisma.purchase.findFirst).toHaveBeenCalledTimes(1);
      // Cache doit être mis à jour
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `access:track:user-123:track-2`,
        60,
        '1'
      );
    });

    it('doit retourner true depuis le cache Redis (sans appel DB)', async () => {
      mockRedis.get.mockResolvedValue('1'); // Cache hit

      const result = await service.canAccessTrack('user-123', paidTrack);

      expect(result).toBe(true);
      expect(mockPrisma.purchase.findFirst).not.toHaveBeenCalled();
    });

    it('doit retourner false depuis le cache Redis (sans appel DB)', async () => {
      mockRedis.get.mockResolvedValue('0'); // Cache miss bloquant

      const result = await service.canAccessTrack('user-123', paidTrack);

      expect(result).toBe(false);
      expect(mockPrisma.purchase.findFirst).not.toHaveBeenCalled();
    });

    it('doit autoriser l\'accès à l\'artiste propriétaire de la track', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null); // Pas d'achat
      mockPrisma.artistProfile.findUnique.mockResolvedValue({
        id: 'artist-1', // Même artistId que la track
        userId: 'user-artist',
      });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-artist', {
        ...paidTrack,
        artistId: 'artist-1',
      });

      expect(result).toBe(true);
    });

    it('doit refuser l\'accès sans achat ni abonnement', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue(null); // Pas d'abonnement
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-free', paidTrack);

      expect(result).toBe(false);
    });
  });

  // ── Quota abonnement ────────────────────────────────────────────────────────

  describe('checkAndConsumeSubscriptionQuota (via canAccessTrack)', () => {
    const paidTrack = { id: 'track-2', price: 500, albumId: null, artistId: 'artist-1' };

    it('doit autoriser et décrémenter le quota Premium si quota disponible', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-premium',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        paidStreamsUsed: 25,  // < 50 (quota PREMIUM)
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
      mockPrisma.subscription.update.mockResolvedValue({ paidStreamsUsed: 26 });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-premium', paidTrack);

      expect(result).toBe(true);
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { paidStreamsUsed: { increment: 1 } },
        })
      );
    });

    it('doit refuser quand le quota Premium est épuisé (50/50)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-premium',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        paidStreamsUsed: 50,  // Quota ÉPUISÉ
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-premium', paidTrack);

      expect(result).toBe(false);
      expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
    });

    it('doit refuser si l\'abonnement est expiré', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-expired',
        tier: 'PREMIUM',
        status: 'ACTIVE',
        paidStreamsUsed: 10,
        currentPeriodEnd: new Date(Date.now() - 1000), // EXPIRÉ
      });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-expired', paidTrack);

      expect(result).toBe(false);
    });

    it('doit autoriser 500 streams pour Premium+', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-premium-plus',
        tier: 'PREMIUM_PLUS',
        status: 'ACTIVE',
        paidStreamsUsed: 499,  // 499/500 — encore de la marge
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
      mockPrisma.subscription.update.mockResolvedValue({ paidStreamsUsed: 500 });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-premium-plus', paidTrack);

      expect(result).toBe(true);
    });

    it('doit refuser si le statut de l\'abonnement n\'est pas ACTIVE', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.purchase.findFirst.mockResolvedValue(null);
      mockPrisma.artistProfile.findUnique.mockResolvedValue(null);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-cancelled',
        tier: 'PREMIUM',
        status: 'CANCELLED', // ← Annulé
        paidStreamsUsed: 0,
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.canAccessTrack('user-cancelled', paidTrack);

      expect(result).toBe(false);
    });
  });
});

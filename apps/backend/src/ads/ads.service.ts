import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AdPlacement, AdStatus } from '@kephale/types';
import { CacheService } from '../redis/cache.service';

export const BOOST_PACKAGES = {
  DISCOVERY: {
    id: 'DISCOVERY',
    title: 'Pack Découverte',
    description: '1 000 Vues / Écoutes garanties',
    badge: 'Bronze',
    impressions: 1000,
    tokensCost: 50,
    durationDays: 7,
  },
  TRENDING: {
    id: 'TRENDING',
    title: 'Pack Tendance',
    description: '5 000 Vues / Écoutes garanties',
    badge: 'Argent',
    impressions: 5000,
    tokensCost: 200,
    durationDays: 14,
  },
  VIRAL: {
    id: 'VIRAL',
    title: 'Pack Viral & Hit',
    description: '20 000 Vues / Écoutes garanties',
    badge: 'Or',
    impressions: 20000,
    tokensCost: 700,
    durationDays: 30,
  },
} as const;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  private get db(): any {
    return this.prisma;
  }

  // ─── AD SERVING ENGINE ───────────────────────────────────────────────────────

  /**
   * High-speed ad server: picks the best active campaign for a given placement & country
   */
  async serveAd(placement: AdPlacement, country?: string, userId?: string) {
    const now = new Date();

    // Fetch active campaigns matching placement & dates
    const campaigns = await this.db.adCampaign.findMany({
      where: {
        status: 'ACTIVE',
        placement,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        advertiser: {
          select: {
            id: true,
            name: true,
            company: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            username: true,
          },
        },
        track: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            audioUrl: true,
          },
        },
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            videoUrl: true,
          },
        },
        album: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
          },
        },
      },
    });

    if (!campaigns || campaigns.length === 0) {
      return null;
    }

    // Filter by quota and country targeting
    const eligible = campaigns.filter((c: any) => {
      // Check impression cap
      if (c.maxImpressions && c.currentImpressions >= c.maxImpressions) {
        return false;
      }
      // Check country targeting (empty array means worldwide)
      if (c.targetCountries && c.targetCountries.length > 0 && country) {
        return c.targetCountries.includes(country.toUpperCase());
      }
      return true;
    });

    if (eligible.length === 0) {
      return null;
    }

    // Weighted/Random pick among eligible campaigns
    const selected: any = eligible[Math.floor(Math.random() * eligible.length)];

    const advertiserName =
      selected.advertiser?.company ||
      selected.advertiser?.name ||
      selected.user?.name ||
      'Sponsorisé';

    return {
      id: selected.id,
      title: selected.title,
      placement: selected.placement,
      mediaUrl: selected.mediaUrl,
      thumbnailUrl: selected.thumbnailUrl,
      targetUrl: selected.targetUrl,
      ctaText: selected.ctaText,
      advertiserName,
      trackId: selected.trackId,
      albumId: selected.albumId,
      videoId: selected.videoId,
    };
  }

  /**
   * Record a verified impression
   */
  async recordImpression(
    campaignId: string,
    data: { userId?: string; country?: string; device?: string; watched100?: boolean },
  ) {
    try {
      const campaign = await this.db.adCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== 'ACTIVE') {
        return { success: false, reason: 'Campaign inactive or not found' };
      }

      // Anti-fraud deduplication window (60s cooldown per user or device per campaign)
      const identifier = data.userId ? `u:${data.userId}` : `d:${(data.device || 'anon').replace(/\s+/g, '')}:${data.country || 'XX'}`;
      const cacheKey = `ad:imp:${campaignId}:${identifier}`;
      const isDuplicate = await this.cacheService.get(cacheKey);

      if (isDuplicate) {
        // Deduplicated: return success without inflating counter
        return { success: true, deduplicated: true };
      }

      await this.cacheService.set(cacheKey, '1', 60);

      // Create impression log
      await this.db.adImpression.create({
        data: {
          campaignId,
          userId: data.userId || null,
          country: data.country?.toUpperCase() || null,
          device: data.device || 'unknown',
          watched100: data.watched100 ?? false,
        },
      });

      // Increment campaign counter
      const updated = await this.db.adCampaign.update({
        where: { id: campaignId },
        data: {
          currentImpressions: { increment: 1 },
        },
      });

      // Auto-complete if budget / impression cap reached
      if (updated.maxImpressions && updated.currentImpressions >= updated.maxImpressions) {
        await this.db.adCampaign.update({
          where: { id: campaignId },
          data: { status: 'COMPLETED' },
        });
      }

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Error recording impression for campaign ${campaignId}: ${err?.message}`);
      return { success: false, error: err?.message };
    }
  }

  /**
   * Record a verified click / interaction
   */
  async recordClick(
    campaignId: string,
    data: { userId?: string; country?: string; device?: string },
  ) {
    try {
      const campaign = await this.db.adCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== 'ACTIVE') {
        return { success: false, reason: 'Campaign inactive or not found' };
      }

      // Anti-fraud deduplication (30s cooldown per user/device click)
      const identifier = data.userId ? `u:${data.userId}` : `d:${(data.device || 'anon').replace(/\s+/g, '')}:${data.country || 'XX'}`;
      const cacheKey = `ad:clk:${campaignId}:${identifier}`;
      const isDuplicate = await this.cacheService.get(cacheKey);

      if (isDuplicate) {
        return { success: true, deduplicated: true };
      }

      await this.cacheService.set(cacheKey, '1', 30);

      // Create click log
      await this.db.adClick.create({
        data: {
          campaignId,
          userId: data.userId || null,
          country: data.country?.toUpperCase() || null,
          device: data.device || 'unknown',
        },
      });

      // Increment campaign counter
      await this.db.adCampaign.update({
        where: { id: campaignId },
        data: {
          currentClicks: { increment: 1 },
        },
      });

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Error recording click for campaign ${campaignId}: ${err?.message}`);
      return { success: false, error: err?.message };
    }
  }

  // ─── SELF-SERVE CREATOR & ARTIST BOOST ENGINE ────────────────────────────────

  /**
   * List available boost package options
   */
  getBoostPackages() {
    return Object.values(BOOST_PACKAGES);
  }

  /**
   * Create and pay for a self-serve content boost using Kephale Tokens
   */
  async createSelfServeBoost(
    userId: string,
    dto: {
      itemId: string;
      itemType: 'REEL' | 'TRACK' | 'ALBUM' | 'CLIP';
      packageId: 'DISCOVERY' | 'TRENDING' | 'VIRAL' | 'CUSTOM';
      customImpressions?: number;
      customDurationDays?: number;
      targetCountries?: string[];
      ctaText?: string;
    },
  ) {
    // 1. Calculate tokens cost & impression cap
    let tokensRequired = 0;
    let impressionsCap = 0;
    let durationDays = 14;

    if (dto.packageId === 'CUSTOM') {
      impressionsCap = dto.customImpressions || 1000;
      if (impressionsCap < 500) {
        throw new BadRequestException('Le plafond minimum de vues personnalisé est de 500.');
      }
      tokensRequired = Math.ceil(impressionsCap / 25); // 1 token = 25 impressions
      durationDays = dto.customDurationDays || 14;
    } else {
      const pkg = BOOST_PACKAGES[dto.packageId];
      if (!pkg) {
        throw new BadRequestException('Pack de boost invalide.');
      }
      tokensRequired = pkg.tokensCost;
      impressionsCap = pkg.impressions;
      durationDays = pkg.durationDays;
    }

    // 2. Verify User & Token Balance
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { artistProfile: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    if (user.tokenBalance < tokensRequired) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_TOKENS',
        message: `Solde de jetons insuffisant. Il vous faut ${tokensRequired} Jetons (Solde actuel : ${user.tokenBalance}).`,
        required: tokensRequired,
        current: user.tokenBalance,
      });
    }

    // 3. Verify Item ownership and extract media info
    let title = '';
    let mediaUrl = '';
    let thumbnailUrl: string | null = null;
    let targetUrl = '';
    let placement: AdPlacement = 'REEL';
    let trackId: string | null = null;
    let albumId: string | null = null;
    let videoId: string | null = null;

    if (dto.itemType === 'REEL' || dto.itemType === 'CLIP') {
      const video = await this.db.video.findUnique({
        where: { id: dto.itemId },
      });

      if (!video) {
        throw new NotFoundException('Vidéo / Reel introuvable.');
      }

      // Check ownership
      const isOwner =
        video.userId === userId ||
        (user.artistProfile && video.artistId === user.artistProfile.id);

      if (!isOwner && user.role !== 'ADMIN') {
        throw new ForbiddenException('Vous ne pouvez sponsoriser que vos propres vidéos.');
      }

      title = `Boost: ${video.title}`;
      mediaUrl = video.videoUrl;
      thumbnailUrl = video.thumbnailUrl;
      targetUrl = `kephale://video/${video.id}`;
      placement = dto.itemType === 'REEL' ? 'REEL' : 'CLIP_PREROLL';
      videoId = video.id;
    } else if (dto.itemType === 'TRACK') {
      const track = await this.db.track.findUnique({
        where: { id: dto.itemId },
      });

      if (!track) {
        throw new NotFoundException('Morceau introuvable.');
      }

      if (!user.artistProfile || track.artistId !== user.artistProfile.id) {
        if (user.role !== 'ADMIN') {
          throw new ForbiddenException('Seul l’artiste propriétaire peut sponsoriser ce morceau.');
        }
      }

      title = `Boost Morceau: ${track.title}`;
      mediaUrl = track.audioUrl;
      thumbnailUrl = track.coverUrl;
      targetUrl = `kephale://track/${track.id}`;
      placement = 'TRACK_BOOST';
      trackId = track.id;
    } else if (dto.itemType === 'ALBUM') {
      const album = await this.db.album.findUnique({
        where: { id: dto.itemId },
      });

      if (!album) {
        throw new NotFoundException('Album introuvable.');
      }

      if (!user.artistProfile || album.artistId !== user.artistProfile.id) {
        if (user.role !== 'ADMIN') {
          throw new ForbiddenException('Seul l’artiste propriétaire peut sponsoriser cet album.');
        }
      }

      title = `Boost Album: ${album.title}`;
      mediaUrl = album.coverUrl;
      thumbnailUrl = album.coverUrl;
      targetUrl = `kephale://album/${album.id}`;
      placement = 'ALBUM_BOOST';
      albumId = album.id;
    }

    const startDate = new Date();
    const endDate = new Date(Date.now() + durationDays * 86400000);

    // 4. Atomic Transaction: Deduct Tokens + Create AdCampaign
    const result = await this.prisma.$transaction(async (tx: any) => {
      // Deduct tokens
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          tokenBalance: { decrement: tokensRequired },
        },
      });

      // Create Campaign
      const campaign = await tx.adCampaign.create({
        data: {
          userId,
          title,
          placement,
          mediaUrl,
          thumbnailUrl,
          targetUrl,
          ctaText: dto.ctaText || 'Écouter maintenant',
          targetCountries: dto.targetCountries || [],
          startDate,
          endDate,
          maxImpressions: impressionsCap,
          costTokens: tokensRequired,
          boostPackage: dto.packageId,
          status: 'ACTIVE',
          trackId,
          albumId,
          videoId,
        },
      });

      // Log TokenTransaction for complete financial audit trail
      await tx.tokenTransaction.create({
        data: {
          userId,
          amount: -tokensRequired,
          type: 'SPEND_BOOST',
          description: `Boost publicitaire (${dto.packageId}) : ${title}`,
          balanceAfter: updatedUser.tokenBalance,
          campaignId: campaign.id,
          metadata: {
            packageId: dto.packageId,
            itemType: dto.itemType,
            itemId: dto.itemId,
            targetCountries: dto.targetCountries || [],
            impressionsCap,
          },
        },
      });

      return {
        campaign,
        newBalance: updatedUser.tokenBalance,
      };
    });

    return {
      success: true,
      data: result.campaign,
      newBalance: result.newBalance,
      tokensDeducted: tokensRequired,
    };
  }

  /**
   * Get all promotions created by a specific user / artist
   */
  async getUserCampaigns(userId: string) {
    return this.db.adCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
          },
        },
        album: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
          },
        },
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
    });
  }

  /**
   * Get deep campaign analytics for the owner of the campaign
   */
  async getUserCampaignAnalytics(userId: string, campaignId: string) {
    const campaign = await this.db.adCampaign.findUnique({
      where: { id: campaignId },
      include: {
        track: true,
        album: true,
        video: true,
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campagne introuvable.');
    }

    if (campaign.userId !== userId) {
      // Check if admin
      const currentUser = await this.db.user.findUnique({ where: { id: userId } });
      if (currentUser?.role !== 'ADMIN') {
        throw new ForbiddenException('Accès refusé à ce rapport publicitaire.');
      }
    }

    return this.getCampaignAnalytics(campaignId);
  }

  // ─── ADVERTISERS & CAMPAIGNS MANAGEMENT (ADMIN) ──────────────────────────────

  async getAdvertisers() {
    return this.db.advertiser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { campaigns: true },
        },
      },
    });
  }

  async createAdvertiser(data: {
    name: string;
    company?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  }) {
    return this.db.advertiser.create({
      data,
    });
  }

  async updateAdvertiser(
    id: string,
    data: {
      name?: string;
      company?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
    },
  ) {
    return this.db.advertiser.update({
      where: { id },
      data,
    });
  }

  async deleteAdvertiser(id: string) {
    return this.db.advertiser.delete({
      where: { id },
    });
  }

  async getCampaigns(filters?: {
    status?: AdStatus;
    placement?: AdPlacement;
    advertiserId?: string;
    userId?: string;
  }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.placement) where.placement = filters.placement;
    if (filters?.advertiserId) where.advertiserId = filters.advertiserId;
    if (filters?.userId) where.userId = filters.userId;

    return this.db.adCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        advertiser: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            username: true,
          },
        },
        track: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
          },
        },
        video: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
    });
  }

  async getCampaignById(id: string) {
    const campaign = await this.db.adCampaign.findUnique({
      where: { id },
      include: {
        advertiser: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            username: true,
          },
        },
        track: true,
        album: true,
        video: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  async createCampaign(data: {
    advertiserId?: string;
    userId?: string;
    title: string;
    placement: AdPlacement;
    mediaUrl: string;
    thumbnailUrl?: string;
    targetUrl: string;
    ctaText?: string;
    targetCountries?: string[];
    startDate: string;
    endDate: string;
    maxImpressions?: number;
    status?: AdStatus;
  }) {
    return this.db.adCampaign.create({
      data: {
        advertiserId: data.advertiserId || null,
        userId: data.userId || null,
        title: data.title,
        placement: data.placement,
        mediaUrl: data.mediaUrl,
        thumbnailUrl: data.thumbnailUrl,
        targetUrl: data.targetUrl,
        ctaText: data.ctaText || 'En savoir plus',
        targetCountries: data.targetCountries || [],
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        maxImpressions: data.maxImpressions,
        status: data.status || 'ACTIVE',
      },
      include: {
        advertiser: true,
      },
    });
  }

  async updateCampaign(
    id: string,
    data: {
      title?: string;
      placement?: AdPlacement;
      mediaUrl?: string;
      thumbnailUrl?: string;
      targetUrl?: string;
      ctaText?: string;
      targetCountries?: string[];
      startDate?: string;
      endDate?: string;
      maxImpressions?: number;
      status?: AdStatus;
    },
  ) {
    return this.db.adCampaign.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.placement ? { placement: data.placement } : {}),
        ...(data.mediaUrl ? { mediaUrl: data.mediaUrl } : {}),
        ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl } : {}),
        ...(data.targetUrl ? { targetUrl: data.targetUrl } : {}),
        ...(data.ctaText ? { ctaText: data.ctaText } : {}),
        ...(data.targetCountries ? { targetCountries: data.targetCountries } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
        ...(data.maxImpressions !== undefined ? { maxImpressions: data.maxImpressions } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
      include: {
        advertiser: true,
      },
    });
  }

  async deleteCampaign(id: string) {
    return this.db.adCampaign.delete({
      where: { id },
    });
  }

  async toggleCampaignStatus(id: string) {
    const campaign = await this.getCampaignById(id);
    const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    return this.db.adCampaign.update({
      where: { id },
      data: { status: newStatus },
      include: { advertiser: true },
    });
  }

  // ─── ROBUST CLIENT ANALYTICS ENGINE ─────────────────────────────────────────

  /**
   * Aggregates comprehensive campaign metrics, CTR, video completion, geo and timeline
   */
  async getCampaignAnalytics(campaignId: string) {
    const campaign = await this.getCampaignById(campaignId);

    const totalImpressions = campaign.currentImpressions;
    const totalClicks = campaign.currentClicks;
    const ctrPercent = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;

    // Video completion (100% watched)
    const completedViewsCount = await this.db.adImpression.count({
      where: {
        campaignId,
        watched100: true,
      },
    });

    const completionRatePercent =
      totalImpressions > 0 ? Number(((completedViewsCount / totalImpressions) * 100).toFixed(2)) : 0;

    // Countries breakdown
    const impressionsByCountry = await this.db.adImpression.groupBy({
      by: ['country'],
      where: { campaignId },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    });

    const clicksByCountry = await this.db.adClick.groupBy({
      by: ['country'],
      where: { campaignId },
      _count: { _all: true },
    });

    const clickMap = new Map(clicksByCountry.map((c: any) => [c.country || 'UNKNOWN', c._count._all]));

    const countriesBreakdown = impressionsByCountry.map((item: any) => ({
      country: item.country || 'Autres',
      impressions: item._count._all,
      clicks: clickMap.get(item.country || 'UNKNOWN') || 0,
    }));

    // Device breakdown
    const devices = await this.db.adImpression.groupBy({
      by: ['device'],
      where: { campaignId },
      _count: { _all: true },
    });

    const devicesBreakdown = devices.map((d: any) => ({
      device: d.device || 'Inconnu',
      impressions: d._count._all,
    }));

    // Last 30 days daily trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const impressionsLast30Days = await this.db.adImpression.findMany({
      where: {
        campaignId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    const clicksLast30Days = await this.db.adClick.findMany({
      where: {
        campaignId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    });

    // Group by YYYY-MM-DD
    const trendMap = new Map<string, { impressions: number; clicks: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      trendMap.set(key, { impressions: 0, clicks: 0 });
    }

    impressionsLast30Days.forEach((imp: any) => {
      const key = imp.createdAt.toISOString().split('T')[0];
      if (trendMap.has(key)) {
        trendMap.get(key)!.impressions += 1;
      }
    });

    clicksLast30Days.forEach((clk: any) => {
      const key = clk.createdAt.toISOString().split('T')[0];
      if (trendMap.has(key)) {
        trendMap.get(key)!.clicks += 1;
      }
    });

    const dailyTrend = Array.from(trendMap.entries()).map(([date, counts]) => ({
      date,
      impressions: counts.impressions,
      clicks: counts.clicks,
    }));

    return {
      campaign,
      totalImpressions,
      totalClicks,
      ctrPercent,
      completionRatePercent,
      completedViewsCount,
      countriesBreakdown,
      devicesBreakdown,
      dailyTrend,
    };
  }

  /**
   * Overview of all active ad metrics for Admin Dashboard KPI
   */
  async getGlobalAdStats() {
    const totalCampaigns = await this.db.adCampaign.count();
    const activeCampaigns = await this.db.adCampaign.count({ where: { status: 'ACTIVE' } });
    const totalAdvertisers = await this.db.advertiser.count();

    const aggregate = await this.db.adCampaign.aggregate({
      _sum: {
        currentImpressions: true,
        currentClicks: true,
      },
    });

    const totalImpressions = aggregate._sum.currentImpressions || 0;
    const totalClicks = aggregate._sum.currentClicks || 0;
    const averageCtr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;

    return {
      totalCampaigns,
      activeCampaigns,
      totalAdvertisers,
      totalImpressions,
      totalClicks,
      averageCtr,
    };
  }

  // ─── GOOGLE ADMOB CONFIG ──────────────────────────────────────────────────────

  private readonly ADMOB_CACHE_KEY = 'admin:admob:config';

  /**
   * Get the current AdMob configuration stored in Redis
   * This is the public endpoint used by the mobile app to get live AdMob unit IDs
   */
  async getAdMobConfig() {
    const cached = await this.cacheService.get<any>(this.ADMOB_CACHE_KEY);
    if (cached) return cached;

    // Return default test IDs if no config saved yet
    return this.getDefaultAdMobConfig();
  }

  /**
   * Save AdMob configuration to Redis (persisted, no TTL)
   * Called by admin to update production AdMob unit IDs
   */
  async saveAdMobConfig(config: AdMobConfigInput) {
    const saved = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    // TTL=0 means no expiry (persist forever)
    await this.cacheService.set(this.ADMOB_CACHE_KEY, saved, 0);
    return saved;
  }

  /**
   * Reset to Google test Ad Unit IDs
   */
  async resetAdMobConfig() {
    const defaultConfig = this.getDefaultAdMobConfig();
    await this.cacheService.set(this.ADMOB_CACHE_KEY, defaultConfig, 0);
    return defaultConfig;
  }

  private getDefaultAdMobConfig(): AdMobConfigDto {
    return {
      isEnabled: false,
      android: {
        appId: 'ca-app-pub-3940256099942544~3347511713', // Test App ID
        banner:        'ca-app-pub-3940256099942544/6300978111',
        interstitial:  'ca-app-pub-3940256099942544/8691691433',
        rewarded:      'ca-app-pub-3940256099942544/5224354917',
        rewardedInterstitial: 'ca-app-pub-3940256099942544/5354046379',
        native:        'ca-app-pub-3940256099942544/2247696110',
        appOpen:       'ca-app-pub-3940256099942544/9257395921',
      },
      ios: {
        appId: 'ca-app-pub-3940256099942544~1458002511', // Test App ID
        banner:        'ca-app-pub-3940256099942544/2934735716',
        interstitial:  'ca-app-pub-3940256099942544/5135589807',
        rewarded:      'ca-app-pub-3940256099942544/1712485313',
        rewardedInterstitial: 'ca-app-pub-3940256099942544/6978759866',
        native:        'ca-app-pub-3940256099942544/3986624511',
        appOpen:       'ca-app-pub-3940256099942544/5575463023',
      },
      placements: {
        feedBanner:           true,
        reelInterstitial:     true,
        trackDetailBanner:    true,
        afterSongRewarded:    false,
        appOpenOnLaunch:      false,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AdMobPlatformConfig {
  appId: string;
  banner: string;
  interstitial: string;
  rewarded: string;
  rewardedInterstitial: string;
  native: string;
  appOpen: string;
}

export interface AdMobConfigDto {
  isEnabled: boolean;
  android: AdMobPlatformConfig;
  ios: AdMobPlatformConfig;
  placements: {
    feedBanner: boolean;
    reelInterstitial: boolean;
    trackDetailBanner: boolean;
    afterSongRewarded: boolean;
    appOpenOnLaunch: boolean;
  };
  updatedAt: string;
}

export type AdMobConfigInput = Omit<AdMobConfigDto, 'updatedAt'>;

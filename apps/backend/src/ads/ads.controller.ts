import { Controller, Get, Post, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AdPlacement } from '@kephale/types';
import { z } from 'zod';

const createBoostSchema = z.object({
  itemId: z.string().min(1),
  itemType: z.enum(['REEL', 'TRACK', 'ALBUM', 'CLIP']),
  packageId: z.enum(['DISCOVERY', 'TRENDING', 'VIRAL', 'CUSTOM']),
  customImpressions: z.number().int().min(500).optional(),
  customDurationDays: z.number().int().min(1).max(90).optional(),
  targetCountries: z.array(z.string()).optional(),
  ctaText: z.string().optional(),
});

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  /**
   * Fetch active sponsor ad for mobile placement
   * GET /ads/serve?placement=REEL&country=ML
   */
  @Get('serve')
  async serveAd(
    @Query('placement') placement: string,
    @Query('country') country?: string,
    @Query('userId') userId?: string,
  ) {
    const validPlacement = (placement as AdPlacement) || 'REEL';
    const ad = await this.adsService.serveAd(validPlacement, country, userId);
    return { success: true, data: ad };
  }

  /**
   * Log an impression (view)
   * POST /ads/:id/impression
   */
  @Post(':id/impression')
  async recordImpression(
    @Param('id') id: string,
    @Body() body: { userId?: string; country?: string; device?: string; watched100?: boolean },
  ) {
    const result = await this.adsService.recordImpression(id, body);
    return result;
  }

  /**
   * Log a click (interaction / redirection)
   * POST /ads/:id/click
   */
  @Post(':id/click')
  async recordClick(
    @Param('id') id: string,
    @Body() body: { userId?: string; country?: string; device?: string },
  ) {
    const result = await this.adsService.recordClick(id, body);
    return result;
  }

  // ─── SELF-SERVE CREATOR & ARTIST BOOSTS ────────────────────────────────────

  /**
   * List standard boost package options & pricing
   * GET /ads/packages
   */
  @Get('packages')
  getBoostPackages() {
    const packages = this.adsService.getBoostPackages();
    return { success: true, data: packages };
  }

  /**
   * Creator / Artist creates and pays for a content boost with tokens
   * POST /ads/boost
   */
  @Post('boost')
  @UseGuards(AuthGuard)
  async createBoost(@Req() req: any, @Body() body: any) {
    const userId = req.user?.userId || req.user?.id;
    const parsed = createBoostSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: { message: 'Données de boost invalides', details: parsed.error.issues },
      });
    }

    const result = await this.adsService.createSelfServeBoost(userId, parsed.data);
    return result;
  }

  /**
   * List all campaigns/promotions created by the logged-in user / artist
   * GET /ads/my-campaigns
   */
  @Get('my-campaigns')
  @UseGuards(AuthGuard)
  async getMyCampaigns(@Req() req: any) {
    const userId = req.user?.userId || req.user?.id;
    const campaigns = await this.adsService.getUserCampaigns(userId);
    return { success: true, data: campaigns };
  }

  /**
   * Deep analytics report for a user-owned campaign
   * GET /ads/my-analytics/:id
   */
  @Get('my-analytics/:id')
  @UseGuards(AuthGuard)
  async getMyCampaignAnalytics(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.id;
    const analytics = await this.adsService.getUserCampaignAnalytics(userId, id);
    return { success: true, data: analytics };
  }
}

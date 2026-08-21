import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdsService } from './ads.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AdPlacement, AdStatus } from '@kephale/types';
import { z } from 'zod';

const createAdvertiserSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

const createCampaignSchema = z.object({
  advertiserId: z.string(),
  title: z.string().min(2),
  placement: z.enum(['REEL', 'CLIP_PREROLL', 'BANNER', 'AUDIO_SPOT']),
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  targetUrl: z.string().url(),
  ctaText: z.string().optional(),
  targetCountries: z.array(z.string()).optional(),
  startDate: z.string(),
  endDate: z.string(),
  maxImpressions: z.number().int().positive().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
});

@Controller('admin/ads')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAdsController {
  constructor(private readonly adsService: AdsService) {}

  /**
   * Global Ad stats for Admin Dashboard KPIs
   */
  @Get('stats')
  async getGlobalStats() {
    const data = await this.adsService.getGlobalAdStats();
    return { success: true, data };
  }

  // ─── ADVERTISERS ─────────────────────────────────────────────────────────────

  @Get('advertisers')
  async getAdvertisers() {
    const data = await this.adsService.getAdvertisers();
    return { success: true, data };
  }

  @Post('advertisers')
  async createAdvertiser(@Body() body: any) {
    const parsed = createAdvertiserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { message: 'Données annonceur invalides', details: parsed.error.issues } });
    }
    const data = await this.adsService.createAdvertiser(parsed.data);
    return { success: true, data };
  }

  @Patch('advertisers/:id')
  async updateAdvertiser(@Param('id') id: string, @Body() body: any) {
    const data = await this.adsService.updateAdvertiser(id, body);
    return { success: true, data };
  }

  @Delete('advertisers/:id')
  async deleteAdvertiser(@Param('id') id: string) {
    await this.adsService.deleteAdvertiser(id);
    return { success: true, message: 'Annonceur supprimé' };
  }

  // ─── CAMPAIGNS ───────────────────────────────────────────────────────────────

  @Get('campaigns')
  async getCampaigns(
    @Query('status') status?: string,
    @Query('placement') placement?: string,
    @Query('advertiserId') advertiserId?: string,
  ) {
    const data = await this.adsService.getCampaigns({
      status: status as AdStatus,
      placement: placement as AdPlacement,
      advertiserId,
    });
    return { success: true, data };
  }

  @Get('campaigns/:id')
  async getCampaignById(@Param('id') id: string) {
    const data = await this.adsService.getCampaignById(id);
    return { success: true, data };
  }

  @Post('campaigns')
  async createCampaign(@Body() body: any) {
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { message: 'Données de campagne invalides', details: parsed.error.issues } });
    }
    const data = await this.adsService.createCampaign(parsed.data as any);
    return { success: true, data };
  }

  @Patch('campaigns/:id')
  async updateCampaign(@Param('id') id: string, @Body() body: any) {
    const data = await this.adsService.updateCampaign(id, body);
    return { success: true, data };
  }

  @Patch('campaigns/:id/toggle-status')
  async toggleCampaignStatus(@Param('id') id: string) {
    const data = await this.adsService.toggleCampaignStatus(id);
    return { success: true, data };
  }

  @Delete('campaigns/:id')
  async deleteCampaign(@Param('id') id: string) {
    await this.adsService.deleteCampaign(id);
    return { success: true, message: 'Campagne supprimée' };
  }

  // ─── CLIENT ANALYTICS & CERTIFIED REPORT ─────────────────────────────────────

  @Get('analytics/:id')
  async getCampaignAnalytics(@Param('id') id: string) {
    const data = await this.adsService.getCampaignAnalytics(id);
    return { success: true, data };
  }

  // ─── GOOGLE ADMOB CONFIG ──────────────────────────────────────────────────────

  /**
   * GET /admin/ads/admob-config
   * Returns the current Google AdMob configuration (unit IDs, placements toggle)
   */
  @Get('admob-config')
  async getAdMobConfig() {
    const data = await this.adsService.getAdMobConfig();
    return { success: true, data };
  }

  /**
   * PUT /admin/ads/admob-config
   * Save / update Google AdMob unit IDs and placement toggles
   */
  @Put('admob-config')
  async saveAdMobConfig(@Body() body: any) {
    if (!body?.android?.appId || !body?.ios?.appId) {
      throw new BadRequestException({ success: false, error: { message: 'Les App IDs Android et iOS sont requis' } });
    }
    const data = await this.adsService.saveAdMobConfig(body);
    return { success: true, data };
  }

  /**
   * DELETE /admin/ads/admob-config
   * Reset to Google official test Ad Unit IDs
   */
  @Delete('admob-config')
  async resetAdMobConfig() {
    const data = await this.adsService.resetAdMobConfig();
    return { success: true, data };
  }
}

import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, BadRequestException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { z } from 'zod';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Stats & Analytics ────────────────────────────────────────────────────

  @Get('stats')
  async getStats() {
    return { success: true, data: await this.adminService.getStats() };
  }

  @Get('stats/growth')
  async getGrowthStats(@Query('days') days?: string) {
    return { success: true, data: await this.adminService.getGrowthStats(days ? parseInt(days) : 30) };
  }

  @Get('stats/content')
  async getTopContent() {
    return { success: true, data: await this.adminService.getTopContent() };
  }

  @Get('stats/revenue')
  async getRevenueStats() {
    return { success: true, data: await this.adminService.getRevenueStats() };
  }

  // ── Gestion des utilisateurs ─────────────────────────────────────────────

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isBanned') isBanned?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getUsers({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search, role,
        isBanned: isBanned !== undefined ? isBanned === 'true' : undefined,
        sortBy, sortOrder,
      }),
    };
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return { success: true, data: await this.adminService.getUserById(id) };
  }

  @Patch('users/:id/ban')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async banUser(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ ban: z.boolean(), reason: z.string().optional() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body: ban (boolean) requis' } });
    return { success: true, data: await this.adminService.banUser(id, parsed.data.ban, parsed.data.reason) };
  }

  @Patch('users/:id/role')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async changeUserRole(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ role: z.enum(['LISTENER', 'ARTIST', 'ADMIN']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Rôle invalide' } });
    return { success: true, data: await this.adminService.changeUserRole(id, parsed.data.role) };
  }

  @Delete('users/:id')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string) {
    return { success: true, data: await this.adminService.deleteUser(id) };
  }

  @Post('users/:id/notify')
  @HttpCode(HttpStatus.OK)
  async notifyUser(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ title: z.string().min(1), body: z.string().min(1) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'title et body requis' } });
    return { success: true, data: await this.adminService.notifyUser(id, parsed.data.title, parsed.data.body) };
  }

  // ── Modération des pistes ────────────────────────────────────────────────

  @Get('tracks')
  async getTracks(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getTracks({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search, status,
      }),
    };
  }

  @Patch('tracks/:id/status')
  async updateTrackStatus(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'FLAGGED']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Statut invalide' } });
    return { success: true, data: await this.adminService.updateTrackStatus(id, parsed.data.status) };
  }

  @Delete('tracks/:id')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async deleteTrack(@Param('id') id: string) {
    return { success: true, data: await this.adminService.deleteTrack(id) };
  }

  // ── Modération des vidéos ────────────────────────────────────────────────

  @Get('videos')
  async getVideos(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getVideos({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search, status,
      }),
    };
  }

  @Patch('videos/:id/status')
  async updateVideoStatus(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'FLAGGED']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Statut invalide' } });
    return { success: true, data: await this.adminService.updateVideoStatus(id, parsed.data.status) };
  }

  // ── Artistes ─────────────────────────────────────────────────────────────

  @Get('artists')
  async getArtists(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isVerified') isVerified?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getArtists({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search,
        isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
      }),
    };
  }

  @Patch('artists/:id/verify')
  async verifyArtist(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ verified: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'verified (boolean) requis' } });
    return { success: true, data: await this.adminService.verifyArtist(id, parsed.data.verified) };
  }

  @Get('artists/:id/earnings')
  async getArtistEarnings(@Param('id') id: string) {
    return { success: true, data: await this.adminService.getArtistEarnings(id) };
  }

  // ── Finances ─────────────────────────────────────────────────────────────

  @Get('withdrawals')
  async getWithdrawals(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getWithdrawals({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        status,
      }),
    };
  }

  @Patch('withdrawals/:id')
  async updateWithdrawalStatus(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ status: z.enum(['COMPLETED', 'FAILED']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });
    return { success: true, data: await this.adminService.updateWithdrawalStatus(id, parsed.data.status) };
  }

  @Get('purchases')
  async getPurchases(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getPurchases({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        type,
      }),
    };
  }

  @Get('subscriptions')
  async getSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getSubscriptions({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        tier, status,
      }),
    };
  }

  // ── Copyright ─────────────────────────────────────────────────────────────

  @Get('copyright-reports')
  async getCopyrightReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.adminService.getCopyrightReports({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        status,
      }),
    };
  }

  @Patch('copyright-reports/:id')
  async resolveCopyrightReport(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({
      action: z.enum(['APPROVED', 'REJECTED']),
      adminNote: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'action requis : APPROVED ou REJECTED' } });
    return { success: true, data: await this.adminService.resolveCopyrightReport(id, parsed.data.action, parsed.data.adminNote) };
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 3600000, limit: 5 } }) // Max 5 broadcasts par heure
  async broadcast(@Body() body: any) {
    const parsed = z.object({
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(500),
      segment: z.enum(['all', 'artists', 'premium']).optional(),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'title et body requis' } });
    return { success: true, data: await this.adminService.broadcastNotification(parsed.data.title, parsed.data.body, parsed.data.segment) };
  }

  // ── Système ───────────────────────────────────────────────────────────────

  @Get('system/health')
  async getSystemHealth() {
    return { success: true, data: await this.adminService.getSystemHealth() };
  }

  @Post('system/cache/flush')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async flushCache(@Body() body: any) {
    const parsed = z.object({ pattern: z.string().optional() }).safeParse(body);
    return { success: true, data: await this.adminService.flushCache(parsed.success ? parsed.data.pattern : undefined) };
  }
}

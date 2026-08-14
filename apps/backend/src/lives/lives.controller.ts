import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { LivesService } from './lives.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { z } from 'zod';
import * as jwt from 'jsonwebtoken';

const CreateLiveSchema = z.object({
  title: z.string({ required_error: "Le titre est obligatoire" }).min(3).max(100),
  description: z.string().max(500).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  mode: z.enum(['VIDEO', 'AUDIO']).default('VIDEO'),
  allowGuests: z.boolean().default(true),
  maxGuests: z.number().min(0).max(50).default(5),
  duration: z.number().min(5).max(480).optional(),
});


@Controller('lives')
export class LivesController {
  constructor(private readonly livesService: LivesService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST')
  async createLive(@Req() req: Request, @Body() body: any) {
    const parsed = CreateLiveSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: parsed.error.errors.map(e => e.message).join(', ') } });

    const data = await this.livesService.createLive(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Post(':id/start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST')
  async startLive(@Req() req: Request, @Param('id') id: string) {
    const data = await this.livesService.startLive(req.user!.userId, id);
    return { success: true, data };
  }

  @Post(':id/join')
  @UseGuards(AuthGuard)
  async joinLive(@Req() req: Request, @Param('id') id: string) {
    const data = await this.livesService.joinLive(req.user!.userId, id);
    return { success: true, data };
  }

  @Post(':id/end')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST')
  async endLive(@Req() req: Request, @Param('id') id: string) {
    const data = await this.livesService.endLive(req.user!.userId, id);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST')
  async deleteLive(@Req() req: Request, @Param('id') id: string) {
    await this.livesService.deleteLive(req.user!.userId, id);
    return { success: true, message: 'Live deleted' };
  }

  @Post(':id/like')
  @UseGuards(AuthGuard)
  async likeLive(@Param('id') id: string) {
    const data = await this.livesService.likeLive(id);
    return { success: true, data };
  }

  @Post(':id/report')
  @UseGuards(AuthGuard)
  async reportLive(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ reason: z.string() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });
    const data = await this.livesService.reportLive(req.user!.userId, id, parsed.data.reason);
    return { success: true, data };
  }

  @Post(':id/participants/request')
  @UseGuards(AuthGuard)
  async requestParticipant(@Req() req: Request, @Param('id') id: string) {
    const data = await this.livesService.requestParticipant(req.user!.userId, id);
    return { success: true, data };
  }

  @Post(':id/participants/:userId/approve')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST')
  async approveParticipant(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    const data = await this.livesService.approveParticipant(req.user!.userId, id, userId);
    return { success: true, data };
  }

  @Get()
  async getLives(@Req() req: Request, @Query() query: any) {
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        userId = decoded.userId;
      }
    } catch {}

    const parsed = z.object({ search: z.string().optional() }).safeParse(query);
    const search = parsed.success ? parsed.data.search : undefined;

    const data = await this.livesService.getLives(userId, search);
    return { success: true, data };
  }
}

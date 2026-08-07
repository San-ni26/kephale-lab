import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TracksService } from './tracks.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { z } from 'zod';

const TrackQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  genre: z.string().optional(),
  artistId: z.string().optional(),
  albumId: z.string().optional(),
  isSingle: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  search: z.string().optional(),
  sort: z.enum(['newest', 'popular', 'price_asc', 'price_desc']).default('newest'),
});

const CreateTrackSchema = z.object({
  title: z.string().min(1).max(200),
  audioUrl: z.string().url(),
  s3Key: z.string(),
  coverUrl: z.string().url().optional(),
  duration: z.number().default(0),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  genre: z.array(z.string()).default([]),
  albumId: z.string().optional(),
  releaseDate: z.string().datetime().optional(),
  isExplicit: z.boolean().default(false),
  bpm: z.number().optional(),
  key: z.string().optional(),
});

const UpdateTrackSchema = CreateTrackSchema.omit({ audioUrl: true, s3Key: true }).partial();

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async createTrack(@Req() req: Request, @Body() body: any) {
    const parsed = CreateTrackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }
    const data = await this.tracksService.createTrack(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Get()
  async getTracks(@Query() query: any) {
    const parsed = TrackQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
    }
    const result = await this.tracksService.getTracks(parsed.data);
    return { success: true, ...result };
  }

  @Get('mine')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async getMyTracks(@Req() req: Request, @Query() query: any) {
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      status: z.enum(['PROCESSING', 'ACTIVE', 'INACTIVE']).optional(),
    });
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }
    const result = await this.tracksService.getMyTracks(req.user!.userId, parsed.data);
    return { success: true, ...result };
  }

  @Get(':id')
  async getTrackById(@Param('id') id: string) {
    const data = await this.tracksService.getTrackById(id);
    return { success: true, data };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async updateTrack(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = UpdateTrackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }
    const data = await this.tracksService.updateTrack(req.user!.userId, id, parsed.data);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async deleteTrack(@Req() req: Request, @Param('id') id: string) {
    await this.tracksService.deleteTrack(req.user!.userId, id);
    return { success: true, data: null };
  }

  /**
   * Sécurité : Rate-limit strict sur le streaming.
   * Max 30 requêtes/minute — empêche le scraping automatisé des URLs.
   */
  @Get(':id/stream')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async streamTrack(@Req() req: Request, @Param('id') id: string) {
    const data = await this.tracksService.streamTrack(req.user!.userId, id);
    return { success: true, data };
  }

  /**
   * Téléchargement offline sécurisé.
   *
   * SÉCURITÉ :
   * - Auth obligatoire
   * - Vérification achat/abonnement côté serveur
   * - Rate-limit strict : max 10 downloads/heure par IP
   * - URL pré-signée retournée (expire en 60s)
   * - Audit trail enregistré en base
   */
  @Get(':id/download')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  async requestDownload(@Req() req: Request, @Param('id') id: string) {
    const data = await this.tracksService.requestDownload(req.user!.userId, id);
    return { success: true, data };
  }

  /**
   * Rate limit play reporting: max 5 per minute per IP per track
   * Prevents play count fraud / analytics manipulation
   */
  @Post(':id/play')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async reportPlay(@Param('id') id: string) {
    await this.tracksService.reportPlay(id);
    return { success: true };
  }

  @Post(':id/like')
  @UseGuards(AuthGuard)
  async toggleLike(@Req() req: Request, @Param('id') id: string) {
    const data = await this.tracksService.toggleLike(req.user!.userId, id);
    return { success: true, data };
  }
}

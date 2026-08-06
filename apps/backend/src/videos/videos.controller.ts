import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { VideosService } from './videos.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { z } from 'zod';
import * as jwt from 'jsonwebtoken';

const CreateVideoSchema = z.object({
  title: z.string().min(1).max(200),
  videoUrl: z.string().url(),
  s3Key: z.string(),
  thumbnailUrl: z.string().optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['CLIP', 'SHORT']),
  duration: z.number().default(0),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  isExplicit: z.boolean().default(false),
  audioTrackId: z.string().optional(),
  originalAudioName: z.string().optional(),
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
  audioVolume: z.number().min(0).max(1).optional(),
  videoVolume: z.number().min(0).max(1).optional(),
});

const VerifyAudioRightsSchema = z.object({
  trackId: z.string().optional(),
  audioTitle: z.string().optional(),
  videoUrl: z.string().optional(),
  videoS3Key: z.string().optional(),
  originalAudioName: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const UpdateVideoSchema = CreateVideoSchema.omit({ videoUrl: true, s3Key: true, type: true }).partial();

const VideoQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  type: z.enum(['CLIP', 'SHORT']).optional(),
  artistId: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['newest', 'popular', 'for_you']).default('newest'),
  refresh: z.coerce.boolean().optional(),
});

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  async getVideos(@Req() req: Request, @Query() query: any) {
    const parsed = VideoQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, secret) as { userId: string };
          userId = decoded.userId;
        }
      }
    } catch {}

    const sessionHeader = (req.headers['x-session-id'] || req.headers['x-anonymous-id']) as string | undefined;
    
    const result = await this.videosService.getVideos(userId, parsed.data, req.ip || '', sessionHeader);
    return { success: true, ...result };
  }

  @Get('mine')
  @UseGuards(AuthGuard)
  async getMyVideos(@Req() req: Request, @Query() query: any) {
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      type: z.enum(['CLIP', 'SHORT']).optional(),
    });
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const result = await this.videosService.getMyVideos(req.user!.userId, parsed.data);
    return { success: true, ...result };
  }

  @Post('verify-audio-rights')
  @UseGuards(AuthGuard)
  async verifyAudioRights(@Req() req: Request, @Body() body: any) {
    const parsed = VerifyAudioRightsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides' } });

    const data = await this.videosService.verifyAudioRights(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Post()
  @UseGuards(AuthGuard)
  async createVideo(@Req() req: Request, @Body() body: any) {
    const parsed = CreateVideoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });

    const data = await this.videosService.createVideo(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Get(':id')
  async getVideoById(@Req() req: Request, @Param('id') id: string) {
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, secret) as { userId: string };
          userId = decoded.userId;
        }
      }
    } catch {}

    const data = await this.videosService.getVideoById(userId, id);
    return { success: true, data };
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async updateVideo(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = UpdateVideoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const data = await this.videosService.updateVideo(req.user!.userId, id, parsed.data);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async deleteVideo(@Req() req: Request, @Param('id') id: string) {
    await this.videosService.deleteVideo(req.user!.userId, id);
    return { success: true, data: null };
  }

  @Get(':id/stream')
  @UseGuards(AuthGuard)
  async streamVideo(@Req() req: Request, @Param('id') id: string) {
    const data = await this.videosService.streamVideo(req.user!.userId, id);
    return { success: true, data };
  }

  @Post(':id/like')
  @UseGuards(AuthGuard)
  async toggleLike(@Req() req: Request, @Param('id') id: string) {
    const data = await this.videosService.toggleLike(req.user!.userId, id);
    return { success: true, data };
  }

  @Post(':id/watch')
  @UseGuards(AuthGuard)
  async watchVideo(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ watchDurationSec: z.number().min(0).max(3600), completed: z.boolean().default(false) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });

    await this.videosService.watchVideo(req.user!.userId, id, parsed.data.watchDurationSec, parsed.data.completed);
    return { success: true };
  }

  @Post(':id/comment')
  @UseGuards(AuthGuard)
  async commentVideo(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ content: z.string().min(1).max(500) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Content required' } });

    const data = await this.videosService.commentVideo(req.user!.userId, id, parsed.data.content);
    return { success: true, data };
  }

  @Get(':id/comments')
  async getComments(@Param('id') id: string, @Query() query: any) {
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
    });
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const result = await this.videosService.getComments(id, parsed.data);
    return { success: true, ...result };
  }
}

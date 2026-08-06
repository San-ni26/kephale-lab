import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AlbumsService } from './albums.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { z } from 'zod';

const CreateAlbumSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url(),
  price: z.number().min(0).default(0),
  currency: z.string().default('XOF'),
  releaseDate: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const UpdateAlbumSchema = CreateAlbumSchema.partial();

const AlbumQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  artistId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).default('ACTIVE'),
  search: z.string().optional(),
  genre: z.string().optional(),
});

@Controller('albums')
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async createAlbum(@Req() req: Request, @Body() body: any) {
    const parsed = CreateAlbumSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    }
    const data = await this.albumsService.createAlbum(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Get()
  async getAlbums(@Query() query: any) {
    const parsed = AlbumQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }
    const result = await this.albumsService.getAlbums(parsed.data);
    return { success: true, ...result };
  }

  @Get('mine')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async getMyAlbums(@Req() req: Request, @Query() query: any) {
    const querySchema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
    });
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }
    const result = await this.albumsService.getMyAlbums(req.user!.userId, parsed.data);
    return { success: true, ...result };
  }

  @Get(':id')
  async getAlbumById(@Param('id') id: string) {
    const data = await this.albumsService.getAlbumById(id);
    return { success: true, data };
  }

  @Get(':id/status')
  @UseGuards(AuthGuard)
  async getAlbumStatus(@Req() req: Request, @Param('id') id: string) {
    const data = await this.albumsService.getAlbumStatus(req.user!.userId, id);
    return { success: true, data };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async updateAlbum(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = UpdateAlbumSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    }
    const data = await this.albumsService.updateAlbum(req.user!.userId, id, parsed.data);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async deleteAlbum(@Req() req: Request, @Param('id') id: string) {
    await this.albumsService.deleteAlbum(req.user!.userId, id);
    return { success: true, data: null };
  }

  @Post(':id/tracks')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async addTrackToAlbum(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ trackId: z.string() }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'trackId required' } });
    }
    await this.albumsService.addTrackToAlbum(req.user!.userId, id, parsed.data.trackId);
    return { success: true, data: null };
  }

  @Delete(':id/tracks/:trackId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async removeTrackFromAlbum(@Req() req: Request, @Param('id') id: string, @Param('trackId') trackId: string) {
    await this.albumsService.removeTrackFromAlbum(req.user!.userId, id, trackId);
    return { success: true, data: null };
  }
}

import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';

@Controller('playlists')
@UseGuards(AuthGuard)
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Get()
  async getPlaylists(@Req() req: Request) {
    const data = await this.playlistsService.getPlaylists(req.user!.userId);
    return { success: true, data };
  }

  @Post()
  async createPlaylist(@Req() req: Request, @Body() body: any) {
    const parsed = z.object({ title: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false });
    }
    const data = await this.playlistsService.createPlaylist(req.user!.userId, parsed.data.title);
    return { success: true, data };
  }

  @Post(':id/tracks')
  async addTrackToPlaylist(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ trackId: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false });
    }
    await this.playlistsService.addTrackToPlaylist(req.user!.userId, id, parsed.data.trackId);
    return { success: true };
  }

  @Get(':id')
  async getPlaylistById(@Req() req: Request, @Param('id') id: string) {
    const data = await this.playlistsService.getPlaylistById(req.user!.userId, id);
    return { success: true, data };
  }

  @Patch(':id')
  async renamePlaylist(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ title: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false });
    }
    const data = await this.playlistsService.renamePlaylist(req.user!.userId, id, parsed.data.title);
    return { success: true, data };
  }

  @Delete(':id')
  async deletePlaylist(@Req() req: Request, @Param('id') id: string) {
    await this.playlistsService.deletePlaylist(req.user!.userId, id);
    return { success: true };
  }

  @Delete(':id/tracks/:trackId')
  async removeTrackFromPlaylist(@Req() req: Request, @Param('id') id: string, @Param('trackId') trackId: string) {
    await this.playlistsService.removeTrackFromPlaylist(req.user!.userId, id, trackId);
    return { success: true };
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArtistsService } from './artists.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { z } from 'zod';

const CreateArtistSchema = z.object({
  stageName: z.string().min(2).max(100),
  bio: z.string().max(2000).optional(),
  genre: z.array(z.string()).default([]),
  country: z.string().length(2).default('ML'),
  avatar: z.string().url().optional(),
  coverImage: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  instagramUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
});

const UpdateArtistSchema = CreateArtistSchema.partial();

const ArtistQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  search: z.string().optional(),
  genre: z.string().optional(),
});

const ArtistTracksQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  isSingle: z.enum(['true', 'false']).optional().transform((val) => val === 'true'),
  sort: z.enum(['newest', 'popular', 'price_asc']).default('newest'),
});

const ArtistVideosQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  type: z.enum(['CLIP', 'SHORT']).optional(),
});

const RequestWithdrawalSchema = z.object({
  amount: z.number().min(500),
  paymentMethod: z.string(),
  paymentDetails: z.string(),
  otpCode: z.string().length(6).optional(),
});

const NotificationPrefSchema = z.object({
  notifyAll: z.boolean().optional(),
  notifyAlbums: z.boolean().optional(),
  notifyTracks: z.boolean().optional(),
  notifyVideos: z.boolean().optional(),
});

@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Req() req: Request, @Body() body: any) {
    const parsed = CreateArtistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }

    const { profile, tokens } = await this.artistsService.createProfile(req.user!.userId, parsed.data);
    return {
      success: true,
      data: profile,
      tokens,
    };
  }

  @Patch('me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async updateOwnProfile(@Req() req: Request, @Body() body: any) {
    const parsed = UpdateArtistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const data = await this.artistsService.updateOwnProfile(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Get('me/dashboard')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async getDashboard(@Req() req: Request) {
    const data = await this.artistsService.getDashboard(req.user!.userId);
    return { success: true, data };
  }

  @Get('me/sales')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async getSales(@Req() req: Request) {
    const data = await this.artistsService.getSales(req.user!.userId);
    return { success: true, data };
  }

  @Get('me/withdrawals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async getWithdrawals(@Req() req: Request) {
    const data = await this.artistsService.getWithdrawals(req.user!.userId);
    return { success: true, data };
  }

  /**
   * Request OTP code before submitting a withdrawal
   * Max 3 requests per 10 minutes to prevent spam
   */
  @Post('me/withdrawals/request-otp')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600000, limit: 3 } })
  async requestWithdrawalOtp(@Req() req: Request) {
    const data = await this.artistsService.requestWithdrawalOtp(req.user!.userId);
    return { success: true, data };
  }

  @Post('me/withdrawals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 600000, limit: 5 } })
  async requestWithdrawal(@Req() req: Request, @Body() body: any) {
    const parsed = RequestWithdrawalSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: { message: 'Invalid input', details: parsed.error.issues },
      });
    }

    const data = await this.artistsService.requestWithdrawal(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Delete('me/withdrawals/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ARTIST', 'ADMIN')
  async cancelWithdrawal(@Req() req: Request, @Param('id') id: string) {
    await this.artistsService.cancelWithdrawal(req.user!.userId, id);
    return { success: true, data: null };
  }

  @Get()
  async getArtists(@Query() query: any) {
    const parsed = ArtistQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }

    const result = await this.artistsService.getArtists(parsed.data);
    return { success: true, ...result };
  }

  @Get(':id')
  async getArtistById(@Param('id') id: string) {
    const data = await this.artistsService.getArtistById(id);
    return { success: true, data };
  }

  @Get(':id/stats')
  async getArtistStats(@Param('id') id: string) {
    const data = await this.artistsService.getArtistStats(id);
    return { success: true, data };
  }

  @Get(':id/tracks')
  async getArtistTracks(@Param('id') id: string, @Query() query: any) {
    const parsed = ArtistTracksQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }

    const result = await this.artistsService.getArtistTracks(id, parsed.data);
    return { success: true, ...result };
  }

  @Get(':id/albums')
  async getArtistAlbums(@Param('id') id: string) {
    const data = await this.artistsService.getArtistAlbums(id);
    return { success: true, data };
  }

  @Get(':id/videos')
  async getArtistVideos(@Param('id') id: string, @Query() query: any) {
    const parsed = ArtistVideosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
    }

    const result = await this.artistsService.getArtistVideos(id, parsed.data);
    return { success: true, ...result };
  }

  @Post(':id/follow')
  @UseGuards(AuthGuard)
  async followArtist(@Req() req: Request, @Param('id') id: string) {
    const data = await this.artistsService.followArtist(req.user!.userId, id);
    return { success: true, data };
  }

  @Delete(':id/follow')
  @UseGuards(AuthGuard)
  async unfollowArtist(@Req() req: Request, @Param('id') id: string) {
    const data = await this.artistsService.unfollowArtist(req.user!.userId, id);
    return { success: true, data };
  }

  @Get(':id/follow-status')
  @UseGuards(AuthGuard)
  async getFollowStatus(@Req() req: Request, @Param('id') id: string) {
    const data = await this.artistsService.getFollowStatus(req.user!.userId, id);
    return { success: true, data };
  }

  @Patch(':id/notifications')
  @UseGuards(AuthGuard)
  async updateNotifications(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const parsed = NotificationPrefSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { message: 'Invalid input' } });
    }

    const data = await this.artistsService.updateNotifications(req.user!.userId, id, parsed.data);
    return { success: true, data };
  }
}

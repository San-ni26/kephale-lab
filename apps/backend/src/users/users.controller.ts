import { Controller, Get, Put, Delete, Post, Patch, Body, Req, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().url().optional(),
  phoneNumber: z.string().optional(),
});

const UpdatePushTokenSchema = z.object({
  token: z.string().min(1).optional(),
  pushToken: z.string().min(1).optional(),
}).refine(data => Boolean(data.token || data.pushToken), {
  message: 'Token is required',
});

const DeleteAccountSchema = z.object({
  password: z.string().optional(),
  artistAction: z.enum(['TRANSFER', 'DELETE']).optional(),
});

const SyncContactsSchema = z.object({
  phoneNumbers: z.array(z.string()),
});

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() req: Request) {
    const data = await this.usersService.getMe(req.user!.userId);
    return { success: true, data };
  }

  @Put('me')
  @UseGuards(AuthGuard)
  async updateMe(@Req() req: Request, @Body() body: any) {
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } });
    }
    const data = await this.usersService.updateMe(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Patch('me/push-token')
  @UseGuards(AuthGuard)
  async updatePushToken(@Req() req: Request, @Body() body: any) {
    const parsed = UpdatePushTokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Token is required' } });
    }
    const token = parsed.data.token || parsed.data.pushToken!;
    const data = await this.usersService.updatePushToken(req.user!.userId, token);
    return { success: true, data };
  }

  @Delete('me')
  @UseGuards(AuthGuard)
  async deleteMe(@Req() req: Request, @Body() body: any) {
    const parsed = DeleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data' } });
    }
    await this.usersService.deleteMe(req.user!.userId, parsed.data);
    return { success: true, data: { message: 'Account deleted' } };
  }

  @Get('me/purchases')
  @UseGuards(AuthGuard)
  async getPurchases(@Req() req: Request) {
    const data = await this.usersService.getPurchases(req.user!.userId);
    return { success: true, data };
  }

  @Get('search')
  @UseGuards(AuthGuard)
  async search(@Query('q') q?: string) {
    const data = await this.usersService.search(q);
    return { success: true, data };
  }

  @Post('sync-contacts')
  @UseGuards(AuthGuard)
  async syncContacts(@Body() body: any) {
    const parsed = SyncContactsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { message: 'Invalid data' } });
    }
    const data = await this.usersService.syncContacts(parsed.data.phoneNumbers);
    return { success: true, data };
  }
}

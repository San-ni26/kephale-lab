import { Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getMyNotifications(@Req() req: Request) {
    const data = await this.notificationsService.getMyNotifications(req.user!.userId);
    return { success: true, data };
  }

  @Patch('read-all')
  @UseGuards(AuthGuard)
  async markAllAsRead(@Req() req: Request) {
    const data = await this.notificationsService.markAllAsRead(req.user!.userId);
    return { success: true, data };
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard)
  async markAsRead(@Req() req: Request, @Param('id') id: string) {
    const data = await this.notificationsService.markAsRead(req.user!.userId, id);
    return { success: true, data };
  }
}

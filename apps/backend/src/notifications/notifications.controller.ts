import { Controller, Get, Patch, Post, Delete, Param, Req, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Enregistrer le token Expo Push de l'appareil
   * Appelé au démarrage de l'app après permission accordée
   * POST /api/v1/notifications/push-token
   */
  @Post('push-token')
  @UseGuards(AuthGuard)
  async registerPushToken(
    @Req() req: Request,
    @Body() body: { token: string },
  ) {
    const data = await this.notificationsService.registerPushToken(
      (req as any).user!.userId,
      body.token,
    );
    return { success: true, data };
  }

  /**
   * Supprimer le token push (logout / désactivation des notifications)
   * DELETE /api/v1/notifications/push-token
   */
  @Delete('push-token')
  @UseGuards(AuthGuard)
  async unregisterPushToken(@Req() req: Request) {
    await this.notificationsService.unregisterPushToken((req as any).user!.userId);
    return { success: true, data: null };
  }

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

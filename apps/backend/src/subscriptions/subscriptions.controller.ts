import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('tiers')
  getTiers() {
    return { success: true, data: this.subscriptionsService.getTiers() };
  }

  @Post('subscribe')
  @UseGuards(AuthGuard)
  async subscribe(@Req() req: Request, @Body() body: any) {
    const SubscribeSchema = z.object({
      tier: z.enum(['PREMIUM', 'PREMIUM_PLUS']),
      password: z.string().min(1, 'La confirmation est requise'),
    });

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
    }

    const data = await this.subscriptionsService.subscribe(req.user!.userId, parsed.data);
    return { success: true, data, message: `Abonnement ${parsed.data.tier} activé avec succès !` };
  }

  @Post('cancel')
  @UseGuards(AuthGuard)
  async cancelSubscription(@Req() req: Request) {
    const data = await this.subscriptionsService.cancelSubscription(req.user!.userId);
    return { success: true, data, message: "L'abonnement sera annulé à la fin de la période actuelle." };
  }
}

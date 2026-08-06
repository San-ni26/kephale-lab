import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';

@Controller('feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  async getFeed(@Req() req: Request) {
    const data = await this.feedService.getFeed(req.user!.userId);
    return { success: true, data };
  }
}

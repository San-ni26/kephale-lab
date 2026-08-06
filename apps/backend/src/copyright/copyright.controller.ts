import { Controller, Post, Get, Body, Param, Query, UseGuards, BadRequestException, Request } from '@nestjs/common';
import { CopyrightService } from './copyright.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { z } from 'zod';
import type { Request as ExpressRequest } from 'express';

@Controller('copyright')
@UseGuards(AuthGuard)
export class CopyrightController {
  constructor(private readonly copyrightService: CopyrightService) {}

  @Post('report')
  async submitReport(@Request() req: ExpressRequest, @Body() body: any) {
    const parsed = z.object({
      videoId: z.string().min(1),
      trackId: z.string().min(1),
      reason: z.string().max(1000).optional(),
    }).safeParse(body);

    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });

    const data = await this.copyrightService.submitReport({
      reporterId: (req as any).user.userId,
      ...parsed.data
    });
    return data;
  }

  @Get('my-reports')
  async getMyReports(@Request() req: ExpressRequest) {
    const data = await this.copyrightService.getMyReports((req as any).user.userId);
    return { success: true, data };
  }

  @Get('my-strikes')
  async getMyStrikes(@Request() req: ExpressRequest) {
    const data = await this.copyrightService.getUserStrikes((req as any).user.userId);
    return { success: true, data };
  }

  // --- Admin Routes ---

  @Get('admin/reports')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async listReports(@Query() query: any) {
    const parsed = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(50).default(20),
      status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
    }).safeParse(query);

    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid query' } });

    const result = await this.copyrightService.listReports(parsed.data);
    return { success: true, data: result.reports, pagination: result.pagination };
  }

  @Post('admin/reports/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async confirmReport(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ adminNotes: z.string().max(2000).optional() }).safeParse(body);
    const result = await this.copyrightService.confirmReport({
      reportId: id,
      adminNotes: parsed.success ? parsed.data.adminNotes : undefined,
    });
    return result;
  }

  @Post('admin/reports/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async rejectReport(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ adminNotes: z.string().max(2000).optional() }).safeParse(body);
    const result = await this.copyrightService.rejectReport({
      reportId: id,
      adminNotes: parsed.success ? parsed.data.adminNotes : undefined,
    });
    return result;
  }
}

import { Controller, Get, Patch, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { z } from 'zod';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    const data = await this.adminService.getStats();
    return { success: true, data };
  }

  @Get('withdrawals')
  async getWithdrawals() {
    const data = await this.adminService.getWithdrawals();
    return { success: true, data };
  }

  @Patch('withdrawals/:id')
  async updateWithdrawalStatus(@Param('id') id: string, @Body() body: any) {
    const parsed = z.object({ status: z.enum(['COMPLETED', 'FAILED']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });

    const data = await this.adminService.updateWithdrawalStatus(id, parsed.data.status);
    return { success: true, data };
  }
}

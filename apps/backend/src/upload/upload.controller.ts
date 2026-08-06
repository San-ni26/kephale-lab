import { Controller, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';

@Controller('upload')
@UseGuards(AuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-url')
  async getPresignedUrl(@Req() req: Request, @Body() body: any) {
    const bodySchema = z.object({
      filename: z.string(),
      contentType: z.string(),
      type: z.enum(['audio', 'video', 'image', 'document']),
    });

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } });
    }

    const requestHost = req.headers.host;
    const data = await this.uploadService.generatePresignedUrl(
      req.user!.userId,
      parsed.data.filename,
      parsed.data.contentType,
      parsed.data.type,
      requestHost
    );

    return { success: true, data };
  }
}

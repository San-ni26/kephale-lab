import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Req() req: Request) {
    const data = await this.chatService.getConversations(req.user!.userId);
    return { success: true, data };
  }

  @Post('request')
  async sendRequest(@Req() req: Request, @Body() body: any) {
    const RequestBodySchema = z.object({
      targetUserId: z.string(),
      message: z.string().min(1)
    });
    const parsed = RequestBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid payload' } });

    const data = await this.chatService.sendRequest(req.user!.userId, parsed.data.targetUserId, parsed.data.message);
    return { success: true, data };
  }

  @Post('conversations/:id/accept')
  async acceptRequest(@Req() req: Request, @Param('id') id: string) {
    const data = await this.chatService.acceptRequest(req.user!.userId, id);
    return { success: true, data };
  }

  @Get('conversations/:id/messages')
  async getMessages(@Req() req: Request, @Param('id') id: string) {
    const data = await this.chatService.getMessages(req.user!.userId, id);
    return { success: true, data };
  }

  @Post('conversations/:id/messages')
  async sendMessage(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const SendMessageSchema = z.object({
      content: z.string().optional(),
      attachmentUrl: z.string().url().optional(),
      attachmentType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'FILE']).optional(),
      attachmentName: z.string().optional()
    });
    const parsed = SendMessageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid payload' } });

    const data = await this.chatService.sendMessage(req.user!.userId, id, parsed.data);
    return { success: true, data };
  }

  @Delete('messages/:messageId')
  async deleteMessage(@Req() req: Request, @Param('messageId') messageId: string) {
    const data = await this.chatService.deleteMessage(req.user!.userId, messageId);
    return { success: true, data };
  }

  @Delete('conversations/:id')
  async deleteConversation(@Req() req: Request, @Param('id') id: string) {
    await this.chatService.deleteConversation(req.user!.userId, id);
    return { success: true, data: null };
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: Request) {
    const data = await this.chatService.getUnreadCount(req.user!.userId);
    return { success: true, data };
  }
}

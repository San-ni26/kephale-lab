import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ChatGateway } from './chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async publishUserUpdate(userId: string, data: any) {
    const channel = `user:${userId}:updates`;
    await this.redis.publish(channel, JSON.stringify(data)).catch(() => {});
    
    // Send via WebSocket directly for real-time
    this.chatGateway.sendToUser(userId, data.type, data);
    this.chatGateway.sendToUser(userId, 'user:update', data);
  }

  async getConversations(userId: string) {
    const now = new Date();

    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { user1Id: userId, user1DeletedAt: null },
          { user2Id: userId, user2DeletedAt: null }
        ],
        NOT: {
          status: 'PENDING',
          expiresAt: { lt: now }
        }
      },
      include: {
        user1: { select: { id: true, name: true, avatar: true, username: true } },
        user2: { select: { id: true, name: true, avatar: true, username: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const countStr = await this.redis.hget(`chat:unread:${userId}`, conv.id);
        const unreadCount = parseInt(countStr || '0', 10);
        return { ...conv, unreadCount };
      })
    );

    return conversationsWithUnread;
  }

  async sendRequest(userId: string, targetUserId: string, messageContent: string) {
    if (userId === targetUserId) {
      throw new BadRequestException({ success: false, error: { message: 'Vous ne pouvez pas vous écrire à vous-même.' } });
    }

    const sender = await this.prisma.user.findUnique({ where: { id: userId } });
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });

    if (!sender || !targetUser) {
      throw new NotFoundException({ success: false, error: { message: 'Utilisateur introuvable.' } });
    }

    const isSenderArtist = sender.role === 'ARTIST';
    const isTargetArtist = targetUser.role === 'ARTIST';
    
    let initialStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' = 'PENDING';
    if (isSenderArtist && !isTargetArtist) {
      initialStatus = 'ACCEPTED';
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: targetUserId },
          { user1Id: targetUserId, user2Id: userId }
        ]
      }
    });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    if (conversation) {
      if (conversation.status === 'PENDING' && conversation.expiresAt && conversation.expiresAt < new Date()) {
        conversation = await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            user1Id: userId, 
            user2Id: targetUserId,
            status: initialStatus,
            expiresAt: initialStatus === 'PENDING' ? expiresAt : null,
            user1DeletedAt: null,
            user2DeletedAt: null
          }
        });
      } else if (conversation.status === 'PENDING' && conversation.user1Id !== userId) {
         conversation = await this.prisma.conversation.update({
           where: { id: conversation.id },
           data: { status: 'ACCEPTED', expiresAt: null, user1DeletedAt: null, user2DeletedAt: null }
         });
      } else if (conversation.status === 'ACCEPTED') {
         conversation = await this.prisma.conversation.update({
           where: { id: conversation.id },
           data: { user1DeletedAt: null, user2DeletedAt: null }
         });
      }
    } else {
      conversation = await this.prisma.conversation.create({
        data: {
          user1Id: userId,
          user2Id: targetUserId,
          status: initialStatus,
          expiresAt: initialStatus === 'PENDING' ? expiresAt : null
        }
      });
    }

    const newMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: messageContent
      }
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { 
        updatedAt: new Date(),
        user1DeletedAt: null,
        user2DeletedAt: null
      }
    });

    await this.redis.hincrby(`chat:unread:${targetUserId}`, conversation.id, 1);
    this.publishUserUpdate(targetUserId, { type: 'CHAT_UNREAD_UPDATE' });

    return { conversation, message: newMessage };
  }

  async acceptRequest(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException({ success: false, error: { message: 'Introuvable' } });

    if (conversation.user2Id !== userId) {
      throw new ForbiddenException({ success: false, error: { message: 'Action non autorisée' } });
    }

    if (conversation.status !== 'PENDING') {
      throw new BadRequestException({ success: false, error: { message: 'Déjà acceptée ou rejetée' } });
    }

    if (conversation.expiresAt && conversation.expiresAt < new Date()) {
      throw new BadRequestException({ success: false, error: { message: 'Demande expirée' } });
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'ACCEPTED', expiresAt: null }
    });

    return updated;
  }

  async getMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      throw new ForbiddenException({ success: false, error: { message: 'Accès refusé' } });
    }

    if (conversation.user1Id === userId && conversation.user1DeletedAt) {
      throw new ForbiddenException({ success: false, error: { message: 'Accès refusé' } });
    }
    if (conversation.user2Id === userId && conversation.user2DeletedAt) {
      throw new ForbiddenException({ success: false, error: { message: 'Accès refusé' } });
    }

    if (conversation.status === 'PENDING' && conversation.expiresAt && conversation.expiresAt < new Date()) {
      throw new ForbiddenException({ success: false, error: { message: 'Demande expirée' } });
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    await this.redis.hdel(`chat:unread:${userId}`, conversationId);
    this.publishUserUpdate(userId, { type: 'CHAT_UNREAD_UPDATE' });

    return messages;
  }

  async sendMessage(userId: string, conversationId: string, data: { content?: string; attachmentUrl?: string; attachmentType?: any; attachmentName?: string }) {
    if (!data.content && !data.attachmentUrl) {
      throw new BadRequestException({ success: false, error: { message: 'Message vide' } });
    }

    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      throw new ForbiddenException({ success: false, error: { message: 'Accès refusé' } });
    }

    if (conversation.status !== 'ACCEPTED') {
      throw new ForbiddenException({ success: false, error: { message: 'La conversation n\'est pas acceptée' } });
    }

    const newMessage = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: data.content || '',
        attachmentUrl: data.attachmentUrl,
        attachmentType: data.attachmentType,
        attachmentName: data.attachmentName
      }
    });

    const targetUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
    
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { 
        updatedAt: new Date(),
        user1DeletedAt: null,
        user2DeletedAt: null
      }
    });

    await this.redis.hincrby(`chat:unread:${targetUserId}`, conversationId, 1);
    
    this.publishUserUpdate(targetUserId, { type: 'NEW_MESSAGE', conversationId, message: newMessage });
    this.publishUserUpdate(targetUserId, { type: 'CHAT_UNREAD_UPDATE' });

    return newMessage;
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });

    if (!message) throw new NotFoundException({ success: false, error: { message: 'Introuvable' } });
    if (message.senderId !== userId) throw new ForbiddenException({ success: false, error: { message: 'Non autorisé' } });

    const deletedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true }
    });

    const targetUserId = message.conversation.user1Id === userId ? message.conversation.user2Id : message.conversation.user1Id;
    
    this.publishUserUpdate(targetUserId, { type: 'MESSAGE_DELETED', conversationId: message.conversationId, messageId });
    this.publishUserUpdate(userId, { type: 'MESSAGE_DELETED', conversationId: message.conversationId, messageId });

    return deletedMessage;
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      throw new ForbiddenException({ success: false, error: { message: 'Accès refusé' } });
    }

    let updatedConversation;
    if (conversation.user1Id === userId) {
      updatedConversation = await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { user1DeletedAt: new Date() }
      });
    } else {
      updatedConversation = await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { user2DeletedAt: new Date() }
      });
    }

    if (updatedConversation.user1DeletedAt && updatedConversation.user2DeletedAt) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    }

    try {
      await this.redis.hdel(`chat:unread:${userId}`, conversationId);
      this.publishUserUpdate(userId, { type: 'CHAT_UNREAD_UPDATE' });
    } catch {}

    return null;
  }

  async getUnreadCount(userId: string) {
    try {
      const counts = await this.redis.hvals(`chat:unread:${userId}`);
      let totalUnread = 0;
      for (const countStr of counts) {
        totalUnread += parseInt(countStr, 10) || 0;
      }
      return { unreadCount: totalUnread };
    } catch {
      return { unreadCount: 0 };
    }
  }
}

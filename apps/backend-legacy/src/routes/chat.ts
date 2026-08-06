import { FastifyInstance } from 'fastify';
import { prisma, ConversationStatus } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import { publishUserUpdate } from '../lib/redisPubSub.js';

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);

  // 1. Lister mes conversations
  fastify.get('/conversations', async (request, reply) => {
    const userId = request.user.userId;
    const now = new Date();

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { user1Id: userId, user1DeletedAt: null },
          { user2Id: userId, user2DeletedAt: null }
        ],
        // Exclure les requêtes PENDING qui ont expiré
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

    // Fetch unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const countStr = await redis.hget(`chat:unread:${userId}`, conv.id);
        const unreadCount = parseInt(countStr || '0', 10);
        return { ...conv, unreadCount };
      })
    );

    reply.send({ success: true, data: conversationsWithUnread });
  });

  // 2. Envoyer une demande de message (Création de conversation PENDING 24H)
  const RequestBodySchema = z.object({
    targetUserId: z.string(),
    message: z.string().min(1)
  });

  fastify.post('/request', async (request, reply) => {
    const userId = request.user.userId;
    const { targetUserId, message } = RequestBodySchema.parse(request.body);

    if (userId === targetUserId) {
      return reply.code(400).send({ success: false, error: { message: "Vous ne pouvez pas vous écrire à vous-même." } });
    }

    const sender = await prisma.user.findUnique({ where: { id: userId } });
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });

    if (!sender || !targetUser) {
      return reply.code(404).send({ success: false, error: { message: "Utilisateur introuvable." } });
    }

    // Règles :
    // ARTIST -> LISTENER/PREMIUM = ACCEPTED direct
    // ARTIST -> ARTIST = PENDING
    // LISTENER -> ARTIST = PENDING
    const isSenderArtist = sender.role === 'ARTIST';
    const isTargetArtist = targetUser.role === 'ARTIST';
    
    let initialStatus: ConversationStatus = 'PENDING';
    if (isSenderArtist && !isTargetArtist) {
      initialStatus = 'ACCEPTED';
    }

    // Vérifier si une conversation existe déjà (dans les deux sens)
    let conversation = await prisma.conversation.findFirst({
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
      // Si la conversation était expirée, on peut la relancer (ou la recréer en mettant à jour)
      if (conversation.status === 'PENDING' && conversation.expiresAt && conversation.expiresAt < new Date()) {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            user1Id: userId, // On re-définit celui qui envoie la demande comme user1
            user2Id: targetUserId,
            status: initialStatus,
            expiresAt: initialStatus === 'PENDING' ? expiresAt : null,
            user1DeletedAt: null,
            user2DeletedAt: null
          }
        });
      } else if (conversation.status === 'PENDING' && conversation.user1Id !== userId) {
         // L'autre nous a déjà envoyé une demande, on l'accepte implicitement
         conversation = await prisma.conversation.update({
           where: { id: conversation.id },
           data: { status: 'ACCEPTED', expiresAt: null, user1DeletedAt: null, user2DeletedAt: null }
         });
      } else if (conversation.status === 'ACCEPTED') {
         // Déjà acceptée, on s'assure juste de réafficher la conversation si elle était supprimée
         conversation = await prisma.conversation.update({
           where: { id: conversation.id },
           data: { user1DeletedAt: null, user2DeletedAt: null }
         });
      }
    } else {
      // Création d'une nouvelle demande
      conversation = await prisma.conversation.create({
        data: {
          user1Id: userId,
          user2Id: targetUserId,
          status: initialStatus,
          expiresAt: initialStatus === 'PENDING' ? expiresAt : null
        }
      });
    }

    // On ajoute le message (si on l'accepte, ou si la conversation est ACCEPTED ou la nouvelle demande)
    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: message
      }
    });

    // Mettre à jour la date de la conversation et réafficher pour l'autre
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { 
        updatedAt: new Date(),
        user1DeletedAt: null,
        user2DeletedAt: null
      }
    });

    // Redis: increment unread count for targetUser
    await redis.hincrby(`chat:unread:${targetUserId}`, conversation.id, 1);
    publishUserUpdate(targetUserId, { type: 'CHAT_UNREAD_UPDATE' });

    reply.send({ success: true, data: { conversation, message: newMessage } });
  });

  // 3. Accepter une demande (seulement pour le destinataire)
  fastify.post('/conversations/:id/accept', async (request, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) return reply.code(404).send({ success: false, error: { message: "Introuvable" } });

    // Si on n'est pas user2, on ne peut pas l'accepter
    if (conversation.user2Id !== userId) {
      return reply.code(403).send({ success: false, error: { message: "Action non autorisée" } });
    }

    if (conversation.status !== 'PENDING') {
      return reply.code(400).send({ success: false, error: { message: "Déjà acceptée ou rejetée" } });
    }

    if (conversation.expiresAt && conversation.expiresAt < new Date()) {
      return reply.code(400).send({ success: false, error: { message: "Demande expirée" } });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: 'ACCEPTED', expiresAt: null }
    });

    reply.send({ success: true, data: updated });
  });

  // 4. Lire les messages
  fastify.get('/conversations/:id/messages', async (request, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      return reply.code(403).send({ success: false, error: { message: "Accès refusé" } });
    }

    if (conversation.user1Id === userId && conversation.user1DeletedAt) {
      return reply.code(403).send({ success: false, error: { message: "Accès refusé" } });
    }
    if (conversation.user2Id === userId && conversation.user2DeletedAt) {
      return reply.code(403).send({ success: false, error: { message: "Accès refusé" } });
    }

    if (conversation.status === 'PENDING' && conversation.expiresAt && conversation.expiresAt < new Date()) {
      return reply.code(403).send({ success: false, error: { message: "Demande expirée" } });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' }
    });

    // Reset unread count for this conversation for current user
    await redis.hdel(`chat:unread:${userId}`, id);
    publishUserUpdate(userId, { type: 'CHAT_UNREAD_UPDATE' });

    reply.send({ success: true, data: messages });
  });

  // 5. Envoyer un message dans une discussion acceptée
  const SendMessageSchema = z.object({
    content: z.string().optional(),
    attachmentUrl: z.string().url().optional(),
    attachmentType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'FILE']).optional(),
    attachmentName: z.string().optional()
  });

  fastify.post('/conversations/:id/messages', async (request, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { content, attachmentUrl, attachmentType, attachmentName } = SendMessageSchema.parse(request.body);

    if (!content && !attachmentUrl) {
      return reply.code(400).send({ success: false, error: { message: "Message vide" } });
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      return reply.code(403).send({ success: false, error: { message: "Accès refusé" } });
    }

    if (conversation.status !== 'ACCEPTED') {
      return reply.code(403).send({ success: false, error: { message: "La conversation n'est pas acceptée" } });
    }

    const newMessage = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: userId,
        content: content || '',
        attachmentUrl,
        attachmentType,
        attachmentName
      }
    });

    const targetUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
    
    // Mettre à jour la date de la conversation et annuler les soft deletes
    await prisma.conversation.update({
      where: { id },
      data: { 
        updatedAt: new Date(),
        user1DeletedAt: null,
        user2DeletedAt: null
      }
    });

    // Redis: increment unread count for targetUser
    await redis.hincrby(`chat:unread:${targetUserId}`, id, 1);
    
    // Publier l'événement NEW_MESSAGE et CHAT_UNREAD_UPDATE
    publishUserUpdate(targetUserId, { type: 'NEW_MESSAGE', conversationId: id, message: newMessage });
    publishUserUpdate(targetUserId, { type: 'CHAT_UNREAD_UPDATE' });

    reply.send({ success: true, data: newMessage });
  });

  // 6. Supprimer un message (Soft delete)
  fastify.delete('/messages/:messageId', async (request, reply) => {
    const userId = request.user.userId;
    const { messageId } = request.params as { messageId: string };

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });

    if (!message) return reply.code(404).send({ success: false, error: { message: "Introuvable" } });
    if (message.senderId !== userId) return reply.code(403).send({ success: false, error: { message: "Non autorisé" } });

    const deletedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true }
    });

    const targetUserId = message.conversation.user1Id === userId ? message.conversation.user2Id : message.conversation.user1Id;
    
    publishUserUpdate(targetUserId, { type: 'MESSAGE_DELETED', conversationId: message.conversationId, messageId });
    publishUserUpdate(userId, { type: 'MESSAGE_DELETED', conversationId: message.conversationId, messageId });

    reply.send({ success: true, data: deletedMessage });
  });
  // 7. Supprimer (Soft Delete) une conversation
  fastify.delete('/conversations/:id', async (request, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || (conversation.user1Id !== userId && conversation.user2Id !== userId)) {
      return reply.code(403).send({ success: false, error: { message: "Accès refusé" } });
    }

    let updatedConversation;
    if (conversation.user1Id === userId) {
      updatedConversation = await prisma.conversation.update({
        where: { id },
        data: { user1DeletedAt: new Date() }
      });
    } else {
      updatedConversation = await prisma.conversation.update({
        where: { id },
        data: { user2DeletedAt: new Date() }
      });
    }

    // Si les deux ont supprimé, on peut purger (Hard Delete)
    if (updatedConversation.user1DeletedAt && updatedConversation.user2DeletedAt) {
      await prisma.conversation.delete({ where: { id } });
    }

    // Reset unread count just in case
    await redis.hdel(`chat:unread:${userId}`, id);
    publishUserUpdate(userId, { type: 'CHAT_UNREAD_UPDATE' });

    reply.send({ success: true, data: null });
  });

  // 7. Obtenir le nombre total de messages non lus
  fastify.get('/unread-count', async (request, reply) => {
    const userId = request.user.userId;
    
    // Retrieve all fields from the hash
    const counts = await redis.hvals(`chat:unread:${userId}`);
    let totalUnread = 0;
    for (const countStr of counts) {
      totalUnread += parseInt(countStr, 10) || 0;
    }
    
    reply.send({ success: true, data: { unreadCount: totalUnread } });
  });
}

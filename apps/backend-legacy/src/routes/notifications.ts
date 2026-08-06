import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const notifications = await prisma.notification.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return reply.send({ success: true, data: notifications });
  });

  fastify.patch('/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    await prisma.notification.updateMany({ where: { userId: user.userId, isRead: false }, data: { isRead: true } });
    return reply.send({ success: true, data: null });
  });

  fastify.patch('/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    await prisma.notification.updateMany({ where: { id, userId: user.userId }, data: { isRead: true } });
    return reply.send({ success: true, data: null });
  });
}

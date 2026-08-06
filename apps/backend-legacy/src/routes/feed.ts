import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';

export async function feedRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;

    // Get artist IDs the user follows
    const follows = await prisma.follow.findMany({
      where: { userId: user.userId },
      select: { artistId: true },
    });

    const artistIds = follows.map((f) => f.artistId);

    const posts = await prisma.post.findMany({
      where: { artistId: { in: artistIds } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
        track: { select: { id: true, title: true, coverUrl: true, duration: true, price: true } },
        video: { select: { id: true, title: true, thumbnailUrl: true, duration: true, type: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    return reply.send({ success: true, data: posts });
  });
}

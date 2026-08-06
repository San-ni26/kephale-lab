import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

export async function playlistRoutes(fastify: FastifyInstance) {
  // Get user's playlists
  fastify.get('/', { preValidation: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const playlists = await prisma.playlist.findMany({
      where: { userId: user.userId },
      include: {
        _count: { select: { items: true } }
      }
    });
    return reply.send({ success: true, data: playlists });
  });

  // Create a playlist
  fastify.post('/', { preValidation: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const schema = z.object({
      title: z.string().min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false });

    const playlist = await prisma.playlist.create({
      data: {
        title: parsed.data.title,
        userId: user.userId,
      }
    });
    return reply.status(201).send({ success: true, data: playlist });
  });

  // Add track to playlist
  fastify.post('/:id/tracks', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    
    const schema = z.object({
      trackId: z.string().min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false });

    // Verify playlist belongs to user
    const playlist = await prisma.playlist.findFirst({ where: { id, userId: user.userId } });
    if (!playlist) return reply.status(404).send({ success: false, error: 'Playlist not found' });

    // Add track to playlist
    const itemsCount = await prisma.playlistItem.count({ where: { playlistId: id } });
    
    try {
      await prisma.playlistItem.create({
        data: {
          playlistId: id,
          trackId: parsed.data.trackId,
          position: itemsCount,
        }
      });
      return reply.send({ success: true });
    } catch (e) {
      // Might already exist due to unique constraint
      return reply.send({ success: true }); // Ignore if already added
    }
  });

  // Get a specific playlist with tracks
  fastify.get('/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: user.userId },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            track: {
              include: { artist: true }
            }
          }
        }
      }
    });

    if (!playlist) return reply.status(404).send({ success: false, error: 'Playlist not found' });
    return reply.send({ success: true, data: playlist });
  });

  // Rename a playlist
  fastify.patch('/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    
    const schema = z.object({
      title: z.string().min(1),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ success: false });

    const playlist = await prisma.playlist.findFirst({ where: { id, userId: user.userId } });
    if (!playlist) return reply.status(404).send({ success: false, error: 'Playlist not found' });

    const updated = await prisma.playlist.update({
      where: { id },
      data: { title: parsed.data.title }
    });

    return reply.send({ success: true, data: updated });
  });

  // Delete a playlist
  fastify.delete('/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const playlist = await prisma.playlist.findFirst({ where: { id, userId: user.userId } });
    if (!playlist) return reply.status(404).send({ success: false, error: 'Playlist not found' });

    await prisma.playlist.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // Remove a track from a playlist
  fastify.delete('/:id/tracks/:trackId', { preValidation: [authenticate] }, async (request, reply) => {
    const { id, trackId } = request.params as { id: string, trackId: string };
    const user = request.user;

    const playlist = await prisma.playlist.findFirst({ where: { id, userId: user.userId } });
    if (!playlist) return reply.status(404).send({ success: false, error: 'Playlist not found' });

    await prisma.playlistItem.deleteMany({
      where: {
        playlistId: id,
        trackId: trackId
      }
    });

    return reply.send({ success: true });
  });
}

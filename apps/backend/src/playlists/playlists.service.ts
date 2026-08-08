import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getPlaylists(userId: string) {
    return this.prisma.playlist.findMany({
      where: { userId },
      include: {
        _count: { select: { items: true } }
      }
    });
  }

  async createPlaylist(userId: string, title: string) {
    return this.prisma.playlist.create({
      data: {
        title,
        userId,
      }
    });
  }

  async addTrackToPlaylist(userId: string, id: string, trackId: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id, userId } });
    if (!playlist) throw new NotFoundException({ success: false, error: 'Playlist not found' });

    const itemsCount = await this.prisma.playlistItem.count({ where: { playlistId: id } });
    
    try {
      await this.prisma.playlistItem.create({
        data: {
          playlistId: id,
          trackId: trackId,
          position: itemsCount,
        }
      });
    } catch (e) {
      // Might already exist due to unique constraint, ignore
    }
  }

  async getPlaylistById(userId: string, id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, userId },
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

    if (!playlist) throw new NotFoundException({ success: false, error: 'Playlist not found' });
    
    return {
      ...playlist,
      items: (playlist.items || []).map((item: any) => ({
        ...item,
        track: item.track ? (({ fingerprint, s3Key, ...t }: any) => t)(item.track) : null,
      })),
    };
  }

  async renamePlaylist(userId: string, id: string, title: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id, userId } });
    if (!playlist) throw new NotFoundException({ success: false, error: 'Playlist not found' });

    return this.prisma.playlist.update({
      where: { id },
      data: { title }
    });
  }

  async deletePlaylist(userId: string, id: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id, userId } });
    if (!playlist) throw new NotFoundException({ success: false, error: 'Playlist not found' });

    await this.prisma.playlist.delete({ where: { id } });
  }

  async removeTrackFromPlaylist(userId: string, id: string, trackId: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id, userId } });
    if (!playlist) throw new NotFoundException({ success: false, error: 'Playlist not found' });

    await this.prisma.playlistItem.deleteMany({
      where: {
        playlistId: id,
        trackId: trackId
      }
    });
  }
}

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccessControlService } from '../subscriptions/access.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AlbumsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accessControlService: AccessControlService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createAlbum(userId: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist profile not found' } });
    }

    const album = await this.prisma.album.create({
      data: {
        artistId: artist.id,
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl,
        price: data.price,
        currency: data.currency,
        status: data.status || 'ACTIVE',
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true } },
        _count: { select: { tracks: true } },
      },
    });

    this.notificationsService.notifyFollowers(artist.id, 'NEW_ALBUM', {
      title: 'Nouvel Album',
      body: `${artist.stageName} a publié un nouvel album : "${album.title}"`,
      data: { albumId: album.id }
    }).catch(console.error);

    return album;
  }

  async getAlbums(query: any) {
    const { page = 1, limit = 20, artistId, status = 'ACTIVE', search, genre } = query;
    const skip = (page - 1) * limit;
    const where: any = { status };
    if (artistId) where.artistId = artistId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { stageName: { contains: search, mode: 'insensitive' } } }
      ];
    }
    if (genre) {
      where.tracks = { some: { genre: { has: genre } } };
    }

    const [total, albums] = await Promise.all([
      this.prisma.album.count({ where }),
      this.prisma.album.findMany({
        where,
        skip,
        take: limit,
        orderBy: { releaseDate: 'desc' },
        include: {
          artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
          _count: { select: { tracks: true, purchases: true } },
        },
      }),
    ]);

    return {
      data: albums,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getMyAlbums(userId: string, query: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (!artist) throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Artist not found' } });

    const { page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;
    const where: any = { artistId: artist.id };

    const [total, albums] = await Promise.all([
      this.prisma.album.count({ where }),
      this.prisma.album.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tracks: true, purchases: true } },
        },
      }),
    ]);

    return {
      data: albums,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }

  async getAlbumById(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: {
        artist: { select: { id: true, stageName: true, avatar: true, coverImage: true, isVerified: true } },
        tracks: {
          where: { status: { not: 'INACTIVE' } },
          orderBy: { createdAt: 'asc' },
          include: {
            artist: { select: { id: true, stageName: true, avatar: true, isVerified: true } },
            _count: { select: { likes: true, purchases: true } },
          },
        },
        _count: { select: { tracks: true, purchases: true } },
      },
    });

    if (!album) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Album not found' } });
    }

    return album;
  }

  async getAlbumStatus(userId: string, id: string) {
    const album = await this.prisma.album.findUnique({ where: { id } });
    if (!album) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'Album not found' } });
    }

    const isPurchased = await this.accessControlService.canAccessAlbum(userId, album);
    return { isPurchased };
  }

  async updateAlbum(userId: string, id: string, data: any) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const album = await this.prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    const updated = await this.prisma.album.update({
      where: { id },
      data: {
        ...data,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      },
      include: {
        _count: { select: { tracks: true } },
      },
    });

    return updated;
  }

  async deleteAlbum(userId: string, id: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const album = await this.prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    await this.prisma.track.updateMany({
      where: { albumId: id },
      data: { albumId: null },
    });

    await this.prisma.album.delete({ where: { id } });
  }

  async addTrackToAlbum(userId: string, id: string, trackId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const album = await this.prisma.album.findUnique({ where: { id } });
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });

    if (!album || !artist || album.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    if (!track || track.artistId !== artist.id) {
      throw new BadRequestException({ success: false, error: { code: 'INVALID_TRACK', message: 'Track not found or not yours' } });
    }

    await this.prisma.track.update({
      where: { id: trackId },
      data: { albumId: id },
    });
  }

  async removeTrackFromAlbum(userId: string, id: string, trackId: string) {
    const artist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    const album = await this.prisma.album.findUnique({ where: { id } });

    if (!album || !artist || album.artistId !== artist.id) {
      throw new ForbiddenException({ success: false, error: { code: 'FORBIDDEN', message: 'Not your album' } });
    }

    await this.prisma.track.updateMany({
      where: { id: trackId, albumId: id, artistId: artist.id },
      data: { albumId: null },
    });
  }
}

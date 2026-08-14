import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { artistProfile: true, subscription: true },
    });
    if (!user) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return user;
  }

  async updateMe(userId: string, data: any) {
    if (data.phoneNumber) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phoneNumber: data.phoneNumber } });
      if (existingPhone && existingPhone.id !== userId) {
        throw new BadRequestException({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Ce numéro de téléphone est déjà utilisé par un autre compte.' } });
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { artistProfile: true, subscription: true },
    });

    return updatedUser;
  }

  async updatePushToken(userId: string, pushToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { pushToken },
      select: { id: true, pushToken: true },
    });
  }

  async deleteMe(userId: string, body: any) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { artistProfile: true },
    });
    
    if (!dbUser) {
      throw new NotFoundException({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    if (dbUser.password) {
      if (!body.password) {
        throw new BadRequestException({ success: false, error: { code: 'PASSWORD_REQUIRED', message: 'Mot de passe requis pour supprimer le compte' } });
      }
      const isValid = await bcrypt.compare(body.password, dbUser.password);
      if (!isValid) {
        throw new ForbiddenException({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Mot de passe incorrect' } });
      }
    }

    if (dbUser.artistProfile) {
      const artist = dbUser.artistProfile;
      const revenueAgg = await this.prisma.purchase.aggregate({
        where: {
          OR: [
            { track: { artistId: artist.id } },
            { album: { artistId: artist.id } },
            { video: { artistId: artist.id } },
          ],
          status: 'SUCCEEDED',
        },
        _sum: { artistAmount: true },
      });
      const trueTotalEarnings = revenueAgg._sum.artistAmount || 0;

      const previousWithdrawalsAgg = await this.prisma.withdrawal.aggregate({
        where: { artistId: artist.id, status: { in: ['COMPLETED', 'PROCESSING', 'PENDING'] } },
        _sum: { amount: true },
      });
      const totalWithdrawnOrPending = previousWithdrawalsAgg._sum.amount || 0;
      const availableBalance = trueTotalEarnings - totalWithdrawnOrPending;

      if (availableBalance >= 500) {
        throw new BadRequestException({ success: false, error: { code: 'PENDING_PAYOUT', message: 'Veuillez retirer vos fonds (solde > 500 FCFA) avant de supprimer votre compte.' } });
      }

      if (!body.artistAction) {
        throw new BadRequestException({ success: false, error: { code: 'ACTION_REQUIRED', message: 'Précisez ce que vous voulez faire de vos contenus (TRANSFER ou DELETE).' } });
      }

      if (body.artistAction === 'TRANSFER') {
        let archiveArtist = await this.prisma.artistProfile.findFirst({
          where: { stageName: 'Kephale Archives' }
        });

        if (!archiveArtist) {
          let systemUser = await this.prisma.user.findUnique({ where: { email: 'system@kephale.com' } });
          if (!systemUser) {
            systemUser = await this.prisma.user.create({
              data: {
                email: 'system@kephale.com',
                name: 'Kephale System',
                username: '@kephale_system',
                role: 'ADMIN',
              }
            });
          }
          archiveArtist = await this.prisma.artistProfile.create({
            data: {
              userId: systemUser.id,
              stageName: 'Kephale Archives',
              bio: 'Contenus cédés à Kephale.',
              isActive: false,
              country: 'SN',
            }
          });
        }

        await this.prisma.track.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
        await this.prisma.album.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
        await this.prisma.video.updateMany({
          where: { artistId: artist.id },
          data: { artistId: archiveArtist.id }
        });
      }
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.prisma.user.delete({ where: { id: userId } });
  }

  async getPurchases(userId: string) {
    return this.prisma.purchase.findMany({
      where: { userId },
      include: {
        track: { include: { artist: true } },
        album: { include: { artist: true } },
        video: { include: { artist: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async search(q?: string) {
    if (!q || q.length < 2) return [];
    
    return this.prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { artistProfile: { stageName: { contains: q, mode: 'insensitive' } } }
        ]
      },
      include: { artistProfile: { select: { stageName: true, avatar: true, id: true } } },
      take: 20
    });
  }

  async syncContacts(phoneNumbers: string[]) {
    const normalizedPhones = phoneNumbers.map(p => p.replace(/[\s\-()]/g, ''));
    
    return this.prisma.user.findMany({
      where: {
        phoneNumber: { in: normalizedPhones },
        isActive: true,
      },
      select: {
        id: true, name: true, username: true, avatar: true, phoneNumber: true,
        artistProfile: { select: { stageName: true, avatar: true, id: true } }
      }
    });
  }
}

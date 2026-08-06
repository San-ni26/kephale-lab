import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';

interface LocalRegisterData {
  email: string;
  password: string;
  name: string;
  username: string;
  phoneNumber?: string;
}

interface LocalLoginData {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  generateTokens(userId: string, role: string) {
    const accessToken = jwt.sign(
      { userId, role },
      this.configService.get<string>('JWT_SECRET')!,
      { expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any }
    );
    const refreshToken = jwt.sign(
      { userId, role },
      this.configService.get<string>('JWT_REFRESH_SECRET')!,
      { expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d') as any }
    );
    return { accessToken, refreshToken };
  }

  async saveRefreshToken(userId: string, token: string) {
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);
    return this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt: refreshExpiresAt,
      },
    });
  }

  async verifyGoogleToken(idToken: string) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new BadRequestException('Jeton d\'authentification Google invalide');
    }
    return payload;
  }

  async loginWithGoogle(idToken: string) {
    const payload = await this.verifyGoogleToken(idToken);
    const email = payload.email!;
    const fallbackName = email.split('@')[0];
    
    const user = await this.prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {
        name: payload.name || fallbackName,
        avatar: payload.picture,
      },
      create: {
        googleId: payload.sub,
        email: email,
        name: payload.name || fallbackName,
        username: await this.generateUniqueUsername(payload.name || fallbackName),
        avatar: payload.picture,
        role: 'LISTENER',
        subscription: {
          create: { tier: 'FREE', status: 'ACTIVE' },
        },
      },
      include: { artistProfile: true, subscription: true },
    });

    const { accessToken, refreshToken } = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, refreshToken);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  }

  async localRegister(data: LocalRegisterData) {
    const emailLower = data.email?.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailLower || !emailRegex.test(emailLower)) {
      throw new BadRequestException('Format d\'adresse email invalide.');
    }

    if (!data.name || data.name.trim().length < 2) {
      throw new BadRequestException('Le nom doit comporter au moins 2 caractères.');
    }

    if (!data.username || !/^@[a-z0-9_]+$/.test(data.username)) {
      throw new BadRequestException('Le nom d\'utilisateur doit commencer par @ et ne contenir que des minuscules, chiffres et tirets bas (_).');
    }

    if (!data.password || data.password.length < 8) {
      throw new BadRequestException('Le mot de passe doit comporter au moins 8 caractères.');
    }
    // OWASP: must contain at least one digit or special char
    const hasComplexity = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(data.password);
    if (!hasComplexity) {
      throw new BadRequestException('Le mot de passe doit contenir au moins un chiffre ou un caractère spécial.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { 
        OR: [
          { email: { equals: emailLower, mode: 'insensitive' } },
          { username: data.username }
        ]
      },
    });
    if (existingUser) {
      if (existingUser.email?.toLowerCase() === emailLower) {
        throw new BadRequestException('Cette adresse email est déjà associée à un compte.');
      }
      if (existingUser.username === data.username) {
        throw new BadRequestException('Ce nom d\'utilisateur est déjà utilisé par un autre compte.');
      }
    }

    if (data.phoneNumber) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phoneNumber: data.phoneNumber } });
      if (existingPhone) {
        throw new BadRequestException('Ce numéro de téléphone est déjà associé à un compte.');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: emailLower,
        password: hashedPassword,
        name: data.name.trim(),
        username: data.username,
        phoneNumber: data.phoneNumber,
        role: 'LISTENER',
        subscription: {
          create: { tier: 'FREE', status: 'ACTIVE' },
        },
      },
      include: { artistProfile: true, subscription: true },
    });

    const { accessToken, refreshToken } = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, refreshToken);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  }

  async localLogin(data: LocalLoginData) {
    const emailLower = data.email?.toLowerCase().trim();
    if (!emailLower || !data.password) {
      throw new BadRequestException('Veuillez renseigner votre email et mot de passe.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: emailLower, mode: 'insensitive' } },
      include: { artistProfile: true, subscription: true },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect.');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Adresse email ou mot de passe incorrect.');
    }

    const { accessToken, refreshToken } = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, refreshToken);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  }

  async refreshTokens(token: string) {
    let payload;
    try {
      payload = jwt.verify(token, this.configService.get<string>('JWT_REFRESH_SECRET')!) as { userId: string; role: string };
    } catch {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter.');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter.');
    }

    // Rotate token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(payload.userId, payload.role);
    await this.saveRefreshToken(payload.userId, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(token: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user) {
      return { success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' };
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); 

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token: rawToken, expiresAt },
    });

    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${rawToken}`;

    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendKey) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Kephale <noreply@kephale.com>',
          to: user.email,
          subject: 'Réinitialisation de votre mot de passe Kephale',
          html: `
            <h2>Réinitialisation de mot de passe</h2>
            <p>Bonjour ${user.name},</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p>
              <a href="${resetUrl}" style="background:#FF5A00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
                Réinitialiser mon mot de passe
              </a>
            </p>
            <p>Ce lien expire dans <strong>1 heure</strong>.</p>
            <p>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
          `,
        });
      } catch (emailErr: any) {
        console.error('[Auth] Failed to send reset email via Resend:', emailErr?.message);
      }
    } else {
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
    }

    return { success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' };
  }

  async resetPasswordConfirm(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Lien de réinitialisation invalide ou expiré.');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Le nouveau mot de passe doit comporter au moins 8 caractères.');
    }
    const hasComplexity = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
    if (!hasComplexity) {
      throw new BadRequestException('Le nouveau mot de passe doit contenir au moins un chiffre ou un caractère spécial.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { isUsed: true },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { success: true, message: 'Mot de passe réinitialisé avec succès. Veuillez vous reconnecter.' };
  }

  async generateUniqueUsername(name: string): Promise<string> {
    let base = '@' + name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (base === '@') base = '@user';
    let newName = base;
    let counter = 1;
    
    while (true) {
      const exists = await this.prisma.user.findUnique({ where: { username: newName } });
      if (!exists) return newName;
      newName = `${base}${counter}`;
      counter++;
    }
  }
}

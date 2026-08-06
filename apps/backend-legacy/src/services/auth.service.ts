import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@kephale/database';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AuthService {
  static generateTokens(userId: string, role: string) {
    const accessToken = jwt.sign(
      { userId, role },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any }
    );
    const refreshToken = jwt.sign(
      { userId, role },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
    );
    return { accessToken, refreshToken };
  }

  static async saveRefreshToken(userId: string, token: string) {
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);
    return prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt: refreshExpiresAt,
      },
    });
  }

  static async verifyGoogleToken(idToken: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw { statusCode: 400, message: 'Invalid Google token' };
    }
    return payload;
  }

  static async loginWithGoogle(idToken: string) {
    const payload = await this.verifyGoogleToken(idToken);
    const email = payload.email!;
    const fallbackName = email.split('@')[0];
    
    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {
        name: payload.name || fallbackName,
        avatar: payload.picture,
      },
      create: {
        googleId: payload.sub,
        email: email,
        name: payload.name || fallbackName,
        username: await AuthService.generateUniqueUsername(payload.name || fallbackName),
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

    return { user, accessToken, refreshToken };
  }

  static async localRegister(data: LocalRegisterData) {
    const existingUser = await prisma.user.findFirst({
      where: { 
        OR: [
          { email: data.email },
          { username: data.username }
        ]
      },
    });
    if (existingUser) {
      if (existingUser.email === data.email) {
        throw { statusCode: 400, message: 'Email is already in use' };
      }
      if (existingUser.username === data.username) {
        throw { statusCode: 400, message: 'Username is already taken' };
      }
    }

    if (data.phoneNumber) {
      const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: data.phoneNumber } });
      if (existingPhone) {
        throw { statusCode: 400, message: 'Ce numéro de téléphone est déjà utilisé.' };
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
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

    return { user, accessToken, refreshToken };
  }

  static async localLogin(data: LocalLoginData) {
    const emailLower = data.email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailLower, mode: 'insensitive' } },
      include: { artistProfile: true, subscription: true },
    });

    if (!user || !user.password) {
      throw { statusCode: 401, message: 'Invalid email or password' };
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password);
    if (!isValidPassword) {
      throw { statusCode: 401, message: 'Invalid email or password' };
    }

    const { accessToken, refreshToken } = this.generateTokens(user.id, user.role);
    await this.saveRefreshToken(user.id, refreshToken);

    return { user, accessToken, refreshToken };
  }

  static async refreshTokens(token: string) {
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { userId: string; role: string };
    } catch {
      throw { statusCode: 401, message: 'Refresh token invalid' };
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw { statusCode: 401, message: 'Refresh token invalid or expired' };
    }

    // Rotate token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(payload.userId, payload.role);
    await this.saveRefreshToken(payload.userId, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  }

  static async logout(token: string) {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { isRevoked: true },
    });
  }

  static async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Security best practice: always return success to avoid email enumeration
    if (!user) {
      return { success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' };
    }

    // Invalider les tokens précédents non utilisés
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    // Générer un token sécurisé (32 bytes = 64 hex chars)
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: rawToken, expiresAt },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    // Envoi de l'email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Kephale <noreply@kephale.com>',
          to: user.email,
          subject: '🔑 Réinitialisation de votre mot de passe Kephale',
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
      // Fallback dev: log the link
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
    }

    return { success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' };
  }

  static async resetPasswordConfirm(token: string, newPassword: string) {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      throw { statusCode: 400, message: 'Lien de réinitialisation invalide ou expiré.' };
    }

    // Marquer le token comme utilisé + changer le mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { isUsed: true },
      }),
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      // Révoquer tous les refresh tokens existants (sécurité)
      prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    return { success: true, message: 'Mot de passe réinitialisé avec succès. Veuillez vous reconnecter.' };
  }

  static async generateUniqueUsername(name: string): Promise<string> {
    let base = '@' + name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (base === '@') base = '@user';
    let newName = base;
    let counter = 1;
    
    while (true) {
      const exists = await prisma.user.findUnique({ where: { username: newName } });
      if (!exists) return newName;
      newName = `${base}${counter}`;
      counter++;
    }
  }
}

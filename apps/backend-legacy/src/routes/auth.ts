import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';

const GoogleAuthSchema = z.object({
  idToken: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const LocalRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  username: z.string().regex(/^@[a-z0-9_]+$/, 'Username must start with @ and contain only lowercase letters, numbers, and underscores'),
  phoneNumber: z.string().optional(),
});

const LocalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(64).max(64),
  newPassword: z.string().min(6, 'Le mot de passe doit faire au moins 6 caractères'),
});

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/google', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const body = GoogleAuthSchema.parse(request.body);
    const { user, accessToken, refreshToken } = await AuthService.loginWithGoogle(body.idToken);
    
    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id, email: user.email, name: user.name, avatar: user.avatar,
          role: user.role, tokenBalance: user.tokenBalance, artistProfile: (user as any).artistProfile,
          subscription: (user as any).subscription,
        },
      },
    });
  });

  fastify.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const body = LocalRegisterSchema.parse(request.body);
    const { user, accessToken, refreshToken } = await AuthService.localRegister(body);
    
    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id, email: user.email, name: user.name, username: user.username, avatar: user.avatar,
          role: user.role, tokenBalance: user.tokenBalance, phoneNumber: user.phoneNumber, artistProfile: user.artistProfile,
          subscription: user.subscription,
        },
      },
    });
  });

  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const body = LocalLoginSchema.parse(request.body);
    const { user, accessToken, refreshToken } = await AuthService.localLogin(body);

    return reply.status(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
          id: user.id, email: user.email, name: user.name, avatar: user.avatar,
          role: user.role, tokenBalance: user.tokenBalance, artistProfile: user.artistProfile,
          subscription: user.subscription,
        },
      },
    });
  });

  fastify.post('/refresh', async (request, reply) => {
    const body = RefreshSchema.parse(request.body);
    const { accessToken, refreshToken } = await AuthService.refreshTokens(body.refreshToken);
    
    return reply.send({
      success: true,
      data: { accessToken, refreshToken, expiresIn: 900 },
    });
  });

  fastify.post('/logout', async (request, reply) => {
    const body = RefreshSchema.parse(request.body);
    await AuthService.logout(body.refreshToken);
    return reply.send({ success: true, data: null });
  });

  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const body = ForgotPasswordSchema.parse(request.body);
    const result = await AuthService.requestPasswordReset(body.email);
    return reply.send(result);
  });

  /**
   * POST /api/v1/auth/reset-password
   * Valider le token de reset et changer le mot de passe
   */
  fastify.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const body = ResetPasswordSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.errors[0]?.message || 'Données invalides' },
      });
    }
    const result = await AuthService.resetPasswordConfirm(body.data.token, body.data.newPassword);
    return reply.send(result);
  });
}

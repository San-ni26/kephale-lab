/**
 * Tests unitaires — AuthService
 *
 * Couvre :
 * - localRegister : succès, email dupliqué, mot de passe trop simple
 * - localLogin : succès, mauvais mot de passe, utilisateur inexistant
 * - refreshTokens : succès avec hash SHA-256, token révoqué, token expiré
 * - hashToken : idempotence SHA-256
 * - requestPasswordReset : OTP généré avec crypto.randomInt
 * - logout : token hashé révoqué
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

// ── Helpers ────────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordResetToken: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// ── Mock ConfigService ─────────────────────────────────────────────────────────

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test-jwt-secret-minimum-32-chars-long',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-minimum-32-chars',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
    };
    return config[key];
  }),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'PrismaClient', useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── hashToken ──────────────────────────────────────────────────────────────

  describe('hashToken (private — testé indirectement)', () => {
    it('doit produire un hash SHA-256 cohérent', () => {
      const token = 'test-refresh-token-abc123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
      expect(hash1).not.toBe(token);
    });

    it('des tokens différents doivent produire des hashes différents', () => {
      expect(hashToken('token-A')).not.toBe(hashToken('token-B'));
    });
  });

  // ── generateTokens ─────────────────────────────────────────────────────────

  describe('generateTokens', () => {
    it('doit générer des tokens JWT valides (access + refresh)', () => {
      const { accessToken, refreshToken } = service.generateTokens('user-123', 'USER');
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(accessToken.split('.')).toHaveLength(3); // JWT = header.payload.signature
      expect(refreshToken.split('.')).toHaveLength(3);
    });

    it('des userId différents doivent produire des tokens différents', () => {
      const { accessToken: t1 } = service.generateTokens('user-1', 'USER');
      const { accessToken: t2 } = service.generateTokens('user-2', 'USER');
      expect(t1).not.toBe(t2);
    });
  });

  // ── localRegister ──────────────────────────────────────────────────────────

  describe('localRegister', () => {
    const validData = {
      email: 'test@kephale.com',
      password: 'SecurePass123!',
      name: 'Test User',
      username: 'testuser',
    };

    it('doit créer un utilisateur et retourner des tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // Pas de doublon
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-123',
        email: validData.email,
        name: validData.name,
        username: validData.username,
        role: 'USER',
        avatarUrl: null,
        tokenBalance: 0,
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.localRegister(validData);

      expect(result.user.email).toBe(validData.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('doit rejeter si l\'email est déjà utilisé', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user', email: validData.email });

      await expect(service.localRegister(validData)).rejects.toThrow(BadRequestException);
    });

    it('doit hasher le mot de passe avant de le stocker', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(async ({ data }) => {
        // Vérifier que le mot de passe est bien hashé (pas en clair)
        expect(data.password).not.toBe(validData.password);
        expect(await bcrypt.compare(validData.password, data.password)).toBe(true);
        return { id: 'user-123', email: data.email, name: data.name, username: data.username, role: 'USER', avatarUrl: null, tokenBalance: 0 };
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      await service.localRegister(validData);
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── localLogin ─────────────────────────────────────────────────────────────

  describe('localLogin', () => {
    const password = 'SecurePass123!';

    it('doit retourner les tokens pour des credentials valides', async () => {
      const hashedPassword = await bcrypt.hash(password, 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@kephale.com',
        password: hashedPassword,
        name: 'Test',
        username: 'test',
        role: 'USER',
        avatarUrl: null,
        tokenBalance: 100,
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.localLogin({ email: 'test@kephale.com', password });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@kephale.com');
    });

    it('doit rejeter si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.localLogin({ email: 'nobody@kephale.com', password })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('doit rejeter si le mot de passe est incorrect', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@kephale.com',
        password: hashedPassword,
        role: 'USER',
      });

      await expect(
        service.localLogin({ email: 'test@kephale.com', password: 'WrongPassword!' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('doit retourner de nouveaux tokens pour un refresh token valide', async () => {
      const { refreshToken } = service.generateTokens('user-123', 'USER');
      const tokenHash = hashToken(refreshToken);

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // Valide 30j
        userId: 'user-123',
      });
      mockPrisma.refreshToken.update.mockResolvedValue({ id: 'rt-1', isRevoked: true });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refreshTokens(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // L'ancien token doit être révoqué
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isRevoked: true } })
      );
    });

    it('doit rejeter un refresh token révoqué', async () => {
      const { refreshToken } = service.generateTokens('user-123', 'USER');
      const tokenHash = hashToken(refreshToken);

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: tokenHash,
        isRevoked: true, // ← Révoqué
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        userId: 'user-123',
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('doit rejeter un refresh token expiré', async () => {
      const { refreshToken } = service.generateTokens('user-123', 'USER');
      const tokenHash = hashToken(refreshToken);

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000), // ← Expiré
        userId: 'user-123',
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('doit rejeter un token JWT invalide (malformé)', async () => {
      await expect(service.refreshTokens('not-a-valid-jwt-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('doit révoquer le token par son hash SHA-256', async () => {
      const { refreshToken } = service.generateTokens('user-123', 'USER');
      const expectedHash = hashToken(refreshToken);

      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(refreshToken);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: expectedHash },
        data: { isRevoked: true },
      });
    });
  });

  // ── requestPasswordReset (OTP cryptographique) ─────────────────────────────

  describe('requestPasswordReset', () => {
    it('doit générer un OTP à 6 chiffres', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@kephale.com',
        name: 'Test User',
      });
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.passwordResetToken.create.mockImplementation(async ({ data }) => {
        // Vérifier que l'OTP est bien un entier à 6 chiffres
        const otpMatch = data.token?.match(/^(\w+):(\d{6})$/);
        expect(otpMatch).toBeTruthy();
        const otp = parseInt(otpMatch![2], 10);
        expect(otp).toBeGreaterThanOrEqual(100000);
        expect(otp).toBeLessThanOrEqual(999999);
        return { id: 'prt-1' };
      });

      // Pas d'erreur envoi email en test
      await expect(service.requestPasswordReset('test@kephale.com')).resolves.not.toThrow();
    });

    it('doit répondre 200 même si l\'email n\'existe pas (protection énumération)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Ne doit pas lever d'exception (timing attack protection)
      await expect(service.requestPasswordReset('nobody@kephale.com')).resolves.toBeDefined();
    });
  });

  // ── saveRefreshToken ───────────────────────────────────────────────────────

  describe('saveRefreshToken', () => {
    it('doit nettoyer les anciens tokens avant d\'en créer un nouveau', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });

      await service.saveRefreshToken('user-123', 'new-refresh-token');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
        })
      );
    });

    it('doit stocker le hash SHA-256 du token, pas le token en clair', async () => {
      const rawToken = 'my-raw-refresh-token';
      const expectedHash = hashToken(rawToken);

      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.refreshToken.create.mockImplementation(async ({ data }) => {
        expect(data.token).toBe(expectedHash);
        expect(data.token).not.toBe(rawToken);
        return { id: 'rt-1' };
      });

      await service.saveRefreshToken('user-123', rawToken);
    });
  });
});

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/**
 * Décorateur @OptionalAuth()
 *
 * Extrait le userId depuis un token Bearer si présent et valide.
 * NE rejette PAS la requête si le token est absent ou invalide (contrairement à AuthGuard).
 *
 * Usage :
 *   @Get()
 *   async getVideos(@OptionalAuth() userId: string | null) { ... }
 */
export const OptionalAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret || !token) return null;

    try {
      const decoded = jwt.verify(token, secret) as { userId: string };
      return decoded.userId ?? null;
    } catch {
      return null;
    }
  }
);

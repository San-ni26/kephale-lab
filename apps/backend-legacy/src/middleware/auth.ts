/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' },
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    request.user = payload;
  } catch {
    return reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token is invalid or expired' },
    });
  }
}

export async function requireArtist(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Artist account required' },
    });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;
  if (!user || user.role !== 'ADMIN') {
    return reply.status(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
  }
}

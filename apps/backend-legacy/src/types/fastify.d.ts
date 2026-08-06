import { JwtPayload } from '../middleware/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

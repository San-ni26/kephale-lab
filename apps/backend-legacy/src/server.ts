import 'dotenv/config';
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { prisma } from '@kephale/database';
import fs from 'fs';

import { authRoutes } from './routes/auth.js';
import { trackRoutes } from './routes/tracks.js';
import { artistRoutes } from './routes/artists.js';
import { videoRoutes } from './routes/videos.js';
import { liveRoutes } from './routes/lives.js';
import { paymentRoutes } from './routes/payments.js';
import { subscriptionRoutes } from './routes/subscriptions.js';
import { feedRoutes } from './routes/feed.js';
import { userRoutes } from './routes/users.js';
import { notificationRoutes } from './routes/notifications.js';
import { uploadRoutes } from './routes/upload.js';
import { playlistRoutes } from './routes/playlists.js';
import { albumRoutes } from './routes/albums.js';
import { chatRoutes } from './routes/chat.js';
import { adminRoutes } from './routes/admin.js';
import { copyrightRoutes } from './routes/copyright.js';
import { webhookRoutes } from './routes/webhooks.js';

import { setupSocketIO } from './socket/index.js';
import { setupBullMQ } from './queues/index.js';
import { setupCronJobs } from './cron/index.js';
import { redis } from './lib/redis.js';

const PORT = Number(process.env.PORT) || 4000;

async function bootstrap() {
  // ── Fastify ──────────────────────────────────────────────────────────────────
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    trustProxy: true,
  });

  // Preserve raw buffer body for Stripe webhook signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      (req as any).rawBody = body;
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err: any) {
        done(err, undefined);
      }
    }
  );

  // ── Plugins ───────────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // handled by CDN
  });

  // Rate-limit : utilise Redis si disponible, sinon mémoire locale
  const redisStatus = redis.status; // 'ready' | 'connecting' | 'close' | 'end' etc.
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    ...(redisStatus === 'ready' ? { redis } : {}), // N'utilise Redis QUE s'il est prêt
    keyGenerator: (req) => req.ip,
    skipOnError: true, // Si Redis plante → passe la requête sans bloquer
    // Auth et paiements ont leur propre rate limit plus strict (configuré dans leurs routes)
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicPath = path.join(__dirname, '../public');

  if (fs.existsSync(publicPath)) {
    await fastify.register(fastifyStatic, {
      root: publicPath,
      prefix: '/static/',
    });
  }

  // ── Swagger Docs ──────────────────────────────────────────────────────────────
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Kephale API',
        description: 'API de la plateforme de streaming musical Kephale',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  // Disabling Swagger UI temporarily because it tries to serve static files which are missing on Prisma Compute deployment.
  // if (process.env.NODE_ENV !== 'production') {
  //   await fastify.register(swaggerUi, {
  //     routePrefix: '/docs',
  //     uiConfig: { docExpansion: 'list', deepLinking: true },
  //     logo: { type: 'image/svg+xml', content: '<svg></svg>' },
  //   });
  // }

  // ── Global Error Handler ──────────────────────────────────────────────────────
  fastify.setErrorHandler((error: any, request, reply) => {
    fastify.log.error(error);
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
      });
    }
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid inputs', details: (error as any).issues },
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }
      });
    }
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: {
        code: error.statusCode ? 'ERROR' : 'INTERNAL_SERVER_ERROR',
        message: error.statusCode ? error.message : 'Internal Server Error'
      },
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  await fastify.register(artistRoutes, { prefix: '/api/v1/artists' });
  await fastify.register(trackRoutes, { prefix: '/api/v1/tracks' });
  await fastify.register(videoRoutes, { prefix: '/api/v1/videos' });
  await fastify.register(liveRoutes, { prefix: '/api/v1/lives' });
  await fastify.register(paymentRoutes, { prefix: '/api/v1/payments' });
  await fastify.register(subscriptionRoutes, { prefix: '/api/v1/subscriptions' });
  await fastify.register(feedRoutes, { prefix: '/api/v1/feed' });
  await fastify.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await fastify.register(uploadRoutes, { prefix: '/api/v1/upload' });
  await fastify.register(playlistRoutes, { prefix: '/api/v1/playlists' });
  await fastify.register(albumRoutes, { prefix: '/api/v1/albums' });
  await fastify.register(chatRoutes, { prefix: '/api/v1/chat' });
  await fastify.register(adminRoutes, { prefix: '/api/v1/admin' });
  await fastify.register(copyrightRoutes, { prefix: '/api/v1/copyright' });
  await fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' });

  // ── Health Check ──────────────────────────────────────────────────────────────
  // NOTE: reste vrai même si BullMQ/S3 ne sont pas encore prêts (voir plus bas) —
  // /health ne teste que DB et Redis, donc il répond correctement dès que le
  // serveur écoute, avec un statut "degraded" si un service annexe traîne.
  fastify.get('/health', async (request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let overallStatus = 'ok';

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      overallStatus = 'degraded';
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      overallStatus = 'degraded';
    }

    const statusCode = overallStatus === 'ok' ? 200 : 503;
    return reply.status(statusCode).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      dependencies: checks,
    });
  });

  // ── HTTP Server + Socket.IO ───────────────────────────────────────────────────
  const allowedOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? '*' : false);
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e5, // 100 KB max payload par message Socket.IO
  });

  setupSocketIO(io);

  // ── Graceful Shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    await fastify.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Start ─────────────────────────────────────────────────────────────────────
  // IMPORTANT : le serveur HTTP démarre AVANT l'initialisation des services annexes
  // (BullMQ, cron, vérification du bucket S3). Ces derniers peuvent échouer ou
  // prendre du temps (retry Redis, latence S3) sans jamais bloquer le port —
  // c'est ce qui causait le "There is no service on this URL" sur Prisma Compute.
  await fastify.ready();
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  fastify.log.info(`🎵 Kephale API running on http://0.0.0.0:${PORT}`);
  fastify.log.info(`📚 API Docs available at http://0.0.0.0:${PORT}/docs`);

  // ── Background Services & S3 (non-bloquant) ───────────────────────────────────
  // ⚠️ Si des routes enqueuent des jobs BullMQ dès la première requête, vérifiez
  // que le producteur exporté par queues/index.ts est utilisable immédiatement
  // (ex: instancié de façon synchrone), même si setupBullMQ() est encore en cours.
  setupBullMQ().catch((err) => {
    fastify.log.error({ err }, 'BullMQ initialization failed');
  });

  setupCronJobs();

  import('./lib/s3.js')
    .then(({ ensureBucketExists }) => ensureBucketExists())
    .catch((err) => {
      fastify.log.error({ err }, 'S3 bucket check failed');
    });
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});

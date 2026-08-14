// ── Sentry — Initialiser EN PREMIER pour capturer les erreurs de démarrage ──
// Doit être en tête de fichier, avant tout autre import NestJS
import { initSentryBackend } from './common/sentry';
initSentryBackend();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhook signature verification
  });

  // ── HTTP Response Compression (Gzip / Deflate) ───────────────────────────
  // Réduit la taille des réponses JSON API de 70% à 90% sur le réseau mobile
  app.use(compression());

  // ── Security Headers (Helmet) ─────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,   // Allow media embedding in app
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://*.supabase.co', 'https://lh3.googleusercontent.com'],
          mediaSrc: ["'self'", 'https://*.supabase.co', 'https://cdn.kephale.app'],
          // connectSrc : autoriser les domaines réels utilisés par l'app
          connectSrc: [
            "'self'",
            'https://*.supabase.co',   // Supabase Storage + Auth
            'https://cdn.kephale.app', // CDN vidéo/audio
            'wss://*.livekit.cloud',   // LiveKit WebSocket (lives)
            'https://identify-eu-west-1.acrcloud.com', // ACRCloud fingerprint
            'https://identifier-eu-west-1.acrcloud.com',
          ],
        },
      },
    })
  );

  // ── CORS (domaines autorisés explicitement) ────────────────────────────────
  // SÉCURITÉ : On n'accepte plus toutes les origines (origin: true était trop permissif)
  const allowedOrigins = [
    // Production
    'https://kephale.com',
    'https://app.kephale.com',
    'https://kephale-lab.onrender.com',
    // Dev local (React Native / Expo Go / web dev)
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19006',
  ];

  app.enableCors({
    origin: (origin: string, callback: (err: Error | null, origin?: string | boolean) => void) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // In development, allow all localhost ports
      if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
  });

  // ── Global Prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global Validation Pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Supprime les props inconnues
      forbidNonWhitelisted: true,   // Rejette explicitement les props inconnues (sécurité renforcée)
      transform: true,
    })
  );

  // ── Global Exception Filter ───────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`[Kephale] Backend running on port ${port} (NODE_ENV=${process.env.NODE_ENV})`);
}
bootstrap();


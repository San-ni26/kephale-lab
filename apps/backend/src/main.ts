import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhook signature verification
  });

  // ── Security Headers (Helmet) ─────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,   // Allow media embedding in app
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://*.supabase.co', 'https://lh3.googleusercontent.com'],
          mediaSrc: ["'self'", 'https://*.supabase.co'],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  // ── CORS (allow all origins, IPs and mobile clients) ───────────────────────
  app.enableCors({
    origin: true, // Allow all origins (reflects request origin)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'],
    exposedHeaders: ['*'],
    credentials: true,
  });

  // ── Global Prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global Validation Pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: false, // Don't throw on extra fields (Zod handles this)
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


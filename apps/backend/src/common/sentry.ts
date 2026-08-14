/**
 * Sentry NestJS Backend — Monitoring d'erreurs et de performance
 *
 * Initialiser dans main.ts AVANT la création de l'application NestJS
 *
 * Pour configurer :
 * 1. Créer un projet "Node.js" sur https://sentry.io
 * 2. Copier le DSN dans SENTRY_DSN dans .env
 * 3. Remplacer les valeurs placeholder
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

/**
 * Initialiser Sentry pour le backend NestJS
 * Appeler cette fonction EN PREMIER dans main.ts, avant tout le reste
 */
export function initSentryBackend() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry Backend] SENTRY_DSN non configuré. Monitoring désactivé.');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION ?? '1.0.0',

    // Performance tracing — 5% en production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // Profiling des fonctions lentes (NestJS handlers)
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.02 : 0.5,

    integrations: [
      // Profiling CPU
      nodeProfilingIntegration(),
      // HTTP requests tracing (pas d'option tracing dans les versions récentes)
      Sentry.httpIntegration(),
    ],

    // Ignorer les erreurs attendues (rate limit, validation)
    ignoreErrors: [
      'ThrottlerException',
      'UnauthorizedException',
      'BadRequestException',
      'NotFoundException',
      'ForbiddenException',
    ],
  });

  console.log(`[Sentry Backend] Initialisé (env: ${process.env.NODE_ENV})`);
}

/**
 * Capturer une exception serveur avec contexte métier
 */
export function captureBackendError(error: Error | unknown, context?: {
  userId?: string;
  endpoint?: string;
  extra?: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV !== 'production') return;

  Sentry.withScope((scope) => {
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.endpoint) scope.setTag('endpoint', context.endpoint);
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}

export { Sentry };

/**
 * Sentry — Monitoring d'erreurs et de performance (Mobile)
 *
 * Configuration :
 * - DSN à renseigner dans EXPO_PUBLIC_SENTRY_DSN
 * - Capture automatique des exceptions non gérées
 * - Contexte utilisateur automatiquement enrichi
 * - Performance tracing sur les routes principales
 *
 * Pour obtenir un DSN :
 * 1. Créer un compte sur https://sentry.io (plan gratuit : 5K events/mois)
 * 2. Créer un projet "React Native"
 * 3. Copier le DSN dans EXPO_PUBLIC_SENTRY_DSN
 */

import * as Sentry from '@sentry/react-native';

// ── Configuration ─────────────────────────────────────────────────────────────
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
// ⚠️ Remplacer par votre DSN depuis https://sentry.io
// Format : https://xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX

/**
 * Initialiser Sentry — appeler AVANT le rendu de l'app (dans _layout.tsx)
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    if (__DEV__) console.warn('[Sentry] DSN non configuré. Définir EXPO_PUBLIC_SENTRY_DSN dans .env');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Activer les releases pour associer les erreurs aux versions
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0',
    dist: process.env.EXPO_PUBLIC_BUILD_NUMBER ?? '1',

    // Environnement
    environment: __DEV__ ? 'development' : 'production',

    // Performance tracing — 10% des transactions en prod pour limiter la quota
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,

    // Désactiver en dev si pas de DSN configuré
    enabled: !__DEV__ || !!process.env.EXPO_PUBLIC_SENTRY_DSN,

    // Intégrations
    integrations: [
      // Navigation tracking automatique (Expo Router)
      Sentry.reactNavigationIntegration(),
    ],

    // Ne pas capturer les erreurs de réseau (trop de bruit)
    ignoreErrors: [
      'Network request failed',
      'Network Error',
      'Request timeout',
      'AbortError',
    ],

    // Breadcrumbs — fil d'Ariane des actions avant l'erreur
    maxBreadcrumbs: 50,
  });
}

// ── Contexte utilisateur ──────────────────────────────────────────────────────

/**
 * Enrichir les rapports Sentry avec l'utilisateur courant
 */
export function setSentryUser(user: {
  id: string;
  plan?: string;
  isArtist?: boolean;
} | null) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      // Ne PAS envoyer l'email/username pour GDPR
      plan: user.plan,
      is_artist: user.isArtist,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Ajouter un tag Sentry (filtrage dans le dashboard)
 */
export function setSentryTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

// ── Capture manuelle ──────────────────────────────────────────────────────────

/**
 * Capturer une exception avec contexte
 */
export function captureError(error: Error | unknown, context?: {
  screen?: string;
  action?: string;
  extra?: Record<string, unknown>;
}) {
  if (__DEV__) {
    console.error('[Sentry]', error, context);
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.screen) scope.setTag('screen', context.screen);
    if (context?.action) scope.setTag('action', context.action);
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(error);
  });
}

/**
 * Capturer un message informatif (warning niveau)
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'warning') {
  if (!__DEV__) {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Ajouter un breadcrumb manuel (fil d'Ariane)
 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

// ── Higher-Order Component Sentry ─────────────────────────────────────────────

/**
 * Wrapper Sentry pour le composant racine — capture les erreurs React
 * Usage : export default Sentry.wrap(App);
 */
export const wrap = Sentry.wrap;

// Export du module Sentry pour usage avancé
export { Sentry };

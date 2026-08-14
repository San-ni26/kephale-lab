/**
 * PostHog Analytics — Kephale
 *
 * Wrapper autour de PostHog React Native SDK
 * Région EU (GDPR-compliant) — gratuit jusqu'à 1M events/mois
 *
 * Events tracés :
 * - track_play         — écoute d'une musique
 * - reel_view          — vue d'un reel (>3s)
 * - reel_like          — like d'un reel
 * - purchase           — achat de contenu
 * - subscription_start — souscription Premium/Premium+
 * - live_join          — rejoindre un live
 * - live_donate        — don pendant un live
 * - search             — recherche effectuée
 * - screen_view        — navigation (écran)
 * - app_open           — ouverture de l'app
 * - logout             — déconnexion
 */

import { PostHog } from 'posthog-react-native';

// ── Configuration PostHog ─────────────────────────────────────────────────────
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || 'phc_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const POSTHOG_HOST = 'https://eu.i.posthog.com'; // EU pour GDPR

let _posthog: PostHog | null = null;

function getPostHog(): PostHog | null {
  if (__DEV__ && !process.env.EXPO_PUBLIC_POSTHOG_API_KEY) {
    // En dev sans clé configurée, on ignore silencieusement
    return null;
  }
  if (!_posthog) {
    _posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // Ne pas capturer automatiquement les sessions (données personnelles)
      captureApplicationLifecycleEvents: true,
      captureDeepLinks: false,
      // Opt-out du fingerprinting d'appareil pour GDPR
      persistence: 'memory',
    });
  }
  return _posthog;
}

// ── Identification ────────────────────────────────────────────────────────────

/**
 * Identifier l'utilisateur dans PostHog après connexion
 */
export function identifyUser(userId: string, properties: {
  plan: 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS';
  country?: string;
  isArtist?: boolean;
  createdAt?: string;
}) {
  try {
    getPostHog()?.identify(userId, {
      plan: properties.plan,
      country: properties.country,
      is_artist: properties.isArtist ?? false,
      created_at: properties.createdAt,
    });
  } catch {
    // Non critique
  }
}

/**
 * Réinitialiser l'identification au logout (GDPR — droit à l'oubli de session)
 */
export function resetAnalyticsUser() {
  try {
    getPostHog()?.reset();
  } catch {
    // Non critique
  }
}

// ── Events ───────────────────────────────────────────────────────────────────

type EventProperties = Record<string, string | number | boolean | undefined | null>;

function capture(event: string, properties?: EventProperties) {
  try {
    getPostHog()?.capture(event, properties);
  } catch {
    // Analytics ne doit jamais bloquer l'UX
  }
}

/** Écoute d'une musique */
export function trackPlay(params: {
  trackId: string;
  artistId?: string;
  genre?: string;
  isPremium?: boolean;
  source: 'feed' | 'search' | 'artist_profile' | 'playlist' | 'recommendation';
}) {
  capture('track_play', {
    track_id: params.trackId,
    artist_id: params.artistId,
    genre: params.genre,
    is_premium: params.isPremium,
    source: params.source,
  });
}

/** Vue d'un Reel (>3 secondes) */
export function trackReelView(params: {
  videoId: string;
  artistId?: string;
  watchedMs?: number;
  source: 'feed' | 'profile' | 'search';
}) {
  capture('reel_view', {
    video_id: params.videoId,
    artist_id: params.artistId,
    watched_ms: params.watchedMs,
    source: params.source,
  });
}

/** Like d'un Reel ou Track */
export function trackLike(params: {
  contentType: 'reel' | 'track' | 'album' | 'clip';
  contentId: string;
  artistId?: string;
}) {
  capture('content_like', {
    content_type: params.contentType,
    content_id: params.contentId,
    artist_id: params.artistId,
  });
}

/** Achat de contenu */
export function trackPurchase(params: {
  contentType: 'track' | 'album' | 'clip' | 'token_pack';
  contentId?: string;
  priceTokens: number;
  priceXof?: number;
  currency?: string;
}) {
  capture('purchase', {
    content_type: params.contentType,
    content_id: params.contentId,
    price_tokens: params.priceTokens,
    price_xof: params.priceXof,
    currency: params.currency ?? 'XOF',
  });
}

/** Démarrage d'un abonnement */
export function trackSubscriptionStart(params: {
  tier: 'PREMIUM' | 'PREMIUM_PLUS';
  priceTokens: number;
  method: 'tokens';
}) {
  capture('subscription_start', {
    tier: params.tier,
    price_tokens: params.priceTokens,
    method: params.method,
  });
}

/** Rejoindre un live */
export function trackLiveJoin(params: {
  liveId: string;
  artistId: string;
  mode: 'VIDEO' | 'AUDIO';
}) {
  capture('live_join', {
    live_id: params.liveId,
    artist_id: params.artistId,
    mode: params.mode,
  });
}

/** Don pendant un live */
export function trackLiveDonate(params: {
  liveId: string;
  artistId: string;
  amountTokens: number;
}) {
  capture('live_donate', {
    live_id: params.liveId,
    artist_id: params.artistId,
    amount_tokens: params.amountTokens,
  });
}

/** Recherche effectuée */
export function trackSearch(params: {
  query: string;
  resultsCount?: number;
  category?: 'all' | 'tracks' | 'artists' | 'albums' | 'videos';
}) {
  // Ne pas envoyer la query exacte pour GDPR — seulement la longueur
  capture('search', {
    query_length: params.query.length,
    results_count: params.resultsCount,
    category: params.category ?? 'all',
  });
}

/** Navigation entre écrans */
export function trackScreenView(screenName: string, properties?: EventProperties) {
  capture('screen_view', { screen: screenName, ...properties });
}

/** Téléchargement hors ligne */
export function trackOfflineDownload(params: {
  contentType: 'track' | 'reel' | 'clip';
  contentId: string;
}) {
  capture('offline_download', {
    content_type: params.contentType,
    content_id: params.contentId,
  });
}

/** Ouverture de l'app */
export function trackAppOpen(source?: 'notification' | 'deeplink' | 'organic') {
  capture('app_open', { source: source ?? 'organic' });
}

// ── Feature Flags ─────────────────────────────────────────────────────────────

/**
 * Vérifier si un feature flag PostHog est activé
 */
export async function isFeatureEnabled(flagKey: string): Promise<boolean> {
  try {
    await getPostHog()?.reloadFeatureFlagsAsync();
    return getPostHog()?.isFeatureEnabled(flagKey) ?? false;
  } catch {
    return false;
  }
}

// Export du client PostHog pour usage avancé
export { getPostHog };

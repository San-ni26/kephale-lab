import { Platform } from 'react-native';
import { useAuthStore } from '../stores';
import { adsAPI } from './api';
import type { AdServedPayload } from '@kephale/types';

/**
 * Google AdMob Unit IDs
 * Uses Google's official Sample Test Ad Unit IDs for development & staging
 * Replace with production AdMob Unit IDs from your Google AdMob console when deploying
 */
export const AD_UNIT_IDS = {
  BANNER: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS || 'ca-app-pub-3940256099942544/2934735716',
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID || 'ca-app-pub-3940256099942544/6300978111',
    default: 'ca-app-pub-3940256099942544/6300978111',
  }),
  INTERSTITIAL_VIDEO: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS || 'ca-app-pub-3940256099942544/5135589807',
    android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID || 'ca-app-pub-3940256099942544/8691691433',
    default: 'ca-app-pub-3940256099942544/8691691433',
  }),
  REWARDED_VIDEO: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS || 'ca-app-pub-3940256099942544/1712485313',
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID || 'ca-app-pub-3940256099942544/5224354917',
    default: 'ca-app-pub-3940256099942544/5224354917',
  }),
};

/**
 * Hook to check if ads should be displayed to the current user
 * Premium subscribers, Artists, and Admins never see ads.
 * Only simple / free accounts (LISTENER without active subscription) see ads.
 */
export function useShouldShowAds(): boolean {
  const { user, isAuthenticated } = useAuthStore();

  // If user is not logged in, treat as free listener -> show ads
  if (!isAuthenticated || !user) {
    return true;
  }

  // Premium, Premium+, Artists, and Admins are 100% ad-free
  if (
    user.role === 'PREMIUM' ||
    user.role === 'PREMIUM_PLUS' ||
    user.role === 'ARTIST' ||
    user.role === 'ADMIN'
  ) {
    return false;
  }

  // Check active subscription status
  if (user.subscription && (user.subscription as any).status === 'ACTIVE') {
    return false;
  }

  return true;
}

// ─── HYBRID AD ENGINE & TRACKING ─────────────────────────────────────────────

/**
 * Attempt to fetch a direct Kephale sponsor ad
 */
export async function fetchDirectAd(placement: 'REEL' | 'CLIP_PREROLL' | 'BANNER' | 'AUDIO_SPOT'): Promise<AdServedPayload | null> {
  try {
    const res = await adsAPI.serve(placement);
    if (res.data?.success && res.data?.data) {
      return res.data.data as AdServedPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Record a verified ad impression
 */
export async function trackAdImpression(campaignId: string, watched100: boolean = false) {
  try {
    await adsAPI.recordImpression(campaignId, {
      device: Platform.OS,
      watched100,
    });
  } catch {}
}

/**
 * Record a verified ad click
 */
export async function trackAdClick(campaignId: string) {
  try {
    await adsAPI.recordClick(campaignId, {
      device: Platform.OS,
    });
  } catch {}
}

// Frequency Capping
let lastInterstitialShownTimestamp = 0;
let clipPlayCountSinceLastAd = 0;
const MIN_INTERVAL_BETWEEN_ADS_MS = 180000; // 3 minutes
const CLIPS_FREQUENCY_TRIGGER = 3;

/**
 * Check if an interstitial pre-roll ad should trigger before a clip
 */
export function shouldTriggerClipInterstitial(shouldShowAds: boolean): boolean {
  if (!shouldShowAds) return false;

  clipPlayCountSinceLastAd += 1;
  const now = Date.now();
  const timeElapsed = now - lastInterstitialShownTimestamp;

  if (clipPlayCountSinceLastAd >= CLIPS_FREQUENCY_TRIGGER && timeElapsed >= MIN_INTERVAL_BETWEEN_ADS_MS) {
    lastInterstitialShownTimestamp = now;
    clipPlayCountSinceLastAd = 0;
    return true;
  }

  return false;
}

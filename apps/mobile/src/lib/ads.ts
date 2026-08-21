import { Platform } from 'react-native';
import { useAuthStore } from '../stores';
import { adsAPI } from './api';
import type { AdServedPayload } from '@kephale/types';

// ── Default fallback test unit IDs (Google official sample) ──────────────────
const TEST_IDS = {
  android: {
    appId:               'ca-app-pub-3940256099942544~3347511713',
    banner:              'ca-app-pub-3940256099942544/6300978111',
    interstitial:        'ca-app-pub-3940256099942544/8691691433',
    rewarded:            'ca-app-pub-3940256099942544/5224354917',
    rewardedInterstitial:'ca-app-pub-3940256099942544/5354046379',
    native:              'ca-app-pub-3940256099942544/2247696110',
    appOpen:             'ca-app-pub-3940256099942544/9257395921',
  },
  ios: {
    appId:               'ca-app-pub-3940256099942544~1458002511',
    banner:              'ca-app-pub-3940256099942544/2934735716',
    interstitial:        'ca-app-pub-3940256099942544/5135589807',
    rewarded:            'ca-app-pub-3940256099942544/1712485313',
    rewardedInterstitial:'ca-app-pub-3940256099942544/6978759866',
    native:              'ca-app-pub-3940256099942544/3986624511',
    appOpen:             'ca-app-pub-3940256099942544/5575463023',
  },
};

// ── Runtime AdMob config (fetched from backend, refreshed on app start) ───────
let _admobConfig: AdMobRemoteConfig | null = null;

export interface AdMobRemoteConfig {
  isEnabled: boolean;
  android: typeof TEST_IDS.android;
  ios: typeof TEST_IDS.ios;
  placements: {
    feedBanner: boolean;
    reelInterstitial: boolean;
    trackDetailBanner: boolean;
    afterSongRewarded: boolean;
    appOpenOnLaunch: boolean;
  };
  updatedAt: string;
}

/**
 * Fetch AdMob configuration from the backend.
 * Call this once at app startup (e.g., in _layout.tsx or AppEntry).
 * The config is cached in memory for the app session.
 */
export async function fetchAdMobConfig(): Promise<AdMobRemoteConfig> {
  try {
    const res = await adsAPI.getAdMobConfig();
    if (res?.data?.success && res.data.data) {
      _admobConfig = res.data.data as AdMobRemoteConfig;
      return _admobConfig;
    }
  } catch {
    // Silently fall back to test IDs
  }
  // Return default test config
  _admobConfig = {
    isEnabled: false,
    android: TEST_IDS.android,
    ios: TEST_IDS.ios,
    placements: {
      feedBanner: true,
      reelInterstitial: true,
      trackDetailBanner: true,
      afterSongRewarded: false,
      appOpenOnLaunch: false,
    },
    updatedAt: new Date().toISOString(),
  };
  return _admobConfig;
}

/**
 * Get the current AdMob unit IDs for the current platform.
 * Uses runtime config if available, falls back to env vars, then test IDs.
 */
export function getAdUnitIds() {
  const isAndroid = Platform.OS === 'android';
  const platformConfig = isAndroid
    ? (_admobConfig?.android ?? TEST_IDS.android)
    : (_admobConfig?.ios ?? TEST_IDS.ios);

  return {
    // App ID (used in app.config.ts plugin config)
    appId: platformConfig.appId,

    // Individual ad unit IDs
    BANNER:               process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID && isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID
                            : process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS && !isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS
                            : platformConfig.banner,

    INTERSTITIAL_VIDEO:   process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID && isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID
                            : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS && !isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS
                            : platformConfig.interstitial,

    REWARDED_VIDEO:       process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID && isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID
                            : process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS && !isAndroid
                            ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS
                            : platformConfig.rewarded,

    REWARDED_INTERSTITIAL: platformConfig.rewardedInterstitial,
    NATIVE:                platformConfig.native,
    APP_OPEN:              platformConfig.appOpen,
  };
}

/**
 * Legacy constant — kept for backward compatibility with existing components.
 * Prefer using getAdUnitIds() for dynamic IDs.
 */
export const AD_UNIT_IDS = {
  BANNER: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS || TEST_IDS.ios.banner,
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID || TEST_IDS.android.banner,
    default: TEST_IDS.android.banner,
  }),
  INTERSTITIAL_VIDEO: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS || TEST_IDS.ios.interstitial,
    android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID || TEST_IDS.android.interstitial,
    default: TEST_IDS.android.interstitial,
  }),
  REWARDED_VIDEO: Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS || TEST_IDS.ios.rewarded,
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID || TEST_IDS.android.rewarded,
    default: TEST_IDS.android.rewarded,
  }),
};

/**
 * Check if ads are enabled and which placements are active.
 * Returns false for everything if remote config says isEnabled=false.
 */
export function getAdPlacements() {
  if (!_admobConfig?.isEnabled) {
    return {
      feedBanner: false,
      reelInterstitial: false,
      trackDetailBanner: false,
      afterSongRewarded: false,
      appOpenOnLaunch: false,
    };
  }
  return _admobConfig.placements;
}

/**
 * Hook to check if ads should be displayed to the current user.
 * Premium subscribers, Artists, and Admins never see ads.
 */
export function useShouldShowAds(): boolean {
  const { user, isAuthenticated } = useAuthStore();

  // Global kill-switch from admin
  if (!_admobConfig?.isEnabled) return false;

  if (!isAuthenticated || !user) return true;

  if (
    user.role === 'PREMIUM' ||
    user.role === 'PREMIUM_PLUS' ||
    user.role === 'ARTIST' ||
    user.role === 'ADMIN'
  ) {
    return false;
  }

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
    await adsAPI.recordImpression(campaignId, { device: Platform.OS, watched100 });
  } catch {}
}

/**
 * Record a verified ad click
 */
export async function trackAdClick(campaignId: string) {
  try {
    await adsAPI.recordClick(campaignId, { device: Platform.OS });
  } catch {}
}

// ── Frequency Capping ─────────────────────────────────────────────────────────
let lastInterstitialShownTimestamp = 0;
let clipPlayCountSinceLastAd = 0;
const MIN_INTERVAL_BETWEEN_ADS_MS = 180_000; // 3 minutes
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

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useShouldShowAds,
  fetchDirectAd,
  trackAdImpression,
  trackAdClick,
  getAdUnitIds,
  getAdPlacements,
} from '../lib/ads';
import { hapticFeedback } from '../lib/haptics';
import type { AdServedPayload } from '@kephale/types';

interface AdBannerProps {
  style?: any;
  /** Which placement to use — defaults to 'BANNER' (Kephale direct ad) */
  placement?: 'BANNER' | 'TRACK_DETAIL';
}

/**
 * Hybrid Ad Banner Component
 *
 * Priority order:
 *  1. Kephale direct sponsor ad (from our own campaign DB)
 *  2. Google AdMob BannerAd (if enabled in admin config)
 *  3. Null (Premium / Artist / Admin users)
 *
 * The Google AdMob import is dynamic to avoid crashing on Expo Go
 * where the native module isn't available.
 */
export default function AdBanner({ style, placement = 'BANNER' }: AdBannerProps) {
  const showAds = useShouldShowAds();
  const [directAd, setDirectAd] = useState<AdServedPayload | null>(null);
  const [useAdMob, setUseAdMob] = useState(false);
  const [AdMobBanner, setAdMobBanner] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    if (!showAds) return;
    let isMounted = true;

    (async () => {
      // 1. Try to get a Kephale direct ad first
      const ad = await fetchDirectAd(placement);
      if (isMounted && ad) {
        setDirectAd(ad);
        trackAdImpression(ad.id);
        return; // Direct ad found — no need for AdMob
      }

      // 2. Check if AdMob banner placement is enabled in admin config
      const placements = getAdPlacements();
      const isPlacementEnabled =
        placement === 'BANNER' ? placements.feedBanner :
        placement === 'TRACK_DETAIL' ? placements.trackDetailBanner : false;

      if (!isPlacementEnabled) return;

      // 3. Dynamically import Google AdMob BannerAd (won't crash on Expo Go)
      try {
        const module = await import('react-native-google-mobile-ads');
        if (isMounted && module?.BannerAd) {
          setAdMobBanner(() => module.BannerAd);
          setUseAdMob(true);
        }
      } catch {
        // react-native-google-mobile-ads not available (Expo Go) — silent fail
      }
    })();

    return () => { isMounted = false; };
  }, [showAds, placement]);

  if (!showAds) return null;

  const handleOpenAd = async () => {
    await hapticFeedback.light();
    if (directAd) {
      trackAdClick(directAd.id);
      if (directAd.targetUrl) {
        Linking.openURL(directAd.targetUrl).catch(() => {});
        return;
      }
    }
    Linking.openURL('https://kephale.app').catch(() => {});
  };

  const handleGoPremium = async () => {
    await hapticFeedback.medium();
    router.push('/buy-tokens');
  };

  // ── Google AdMob Banner ────────────────────────────────────────────────────
  if (useAdMob && AdMobBanner) {
    const ids = getAdUnitIds();
    const unitId = ids.BANNER as string;

    return (
      <View style={[styles.admobContainer, style]}>
        <AdMobBanner
          unitId={unitId}
          size="BANNER"
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
          onAdLoaded={() => {}}
          onAdFailedToLoad={() => setUseAdMob(false)}
        />
        <TouchableOpacity style={styles.premiumHint} onPress={handleGoPremium} activeOpacity={0.8}>
          <Ionicons name="sparkles" size={11} color="#FFD700" />
          <Text style={styles.premiumHintText}>Passer Premium = 0 pub</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Kephale Direct Sponsor Banner ─────────────────────────────────────────
  if (directAd) {
    return (
      <TouchableOpacity style={[styles.container, style]} onPress={handleOpenAd} activeOpacity={0.85}>
        {directAd.thumbnailUrl ? (
          <Image source={{ uri: directAd.thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={styles.iconFallback}>
            <Ionicons name="megaphone-outline" size={18} color="#E0A96D" />
          </View>
        )}
        <View style={styles.textBlock}>
          <View style={styles.sponsoredBadge}>
            <Ionicons name="megaphone-outline" size={10} color="#E0A96D" />
            <Text style={styles.sponsoredText}>Sponsorisé · {directAd.advertiserName}</Text>
          </View>
          <Text style={styles.adTitle} numberOfLines={1}>{directAd.title}</Text>
          <Text style={styles.ctaText}>{directAd.ctaText || 'En savoir plus →'}</Text>
        </View>
        <TouchableOpacity style={styles.premiumPill} onPress={handleGoPremium}>
          <Ionicons name="sparkles" size={11} color="#FFD700" />
          <Text style={styles.premiumPillText}>Premium</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Nothing to show
  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(224, 169, 109, 0.15)',
    marginHorizontal: 12,
    marginVertical: 6,
  },
  admobContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    flexShrink: 0,
  },
  iconFallback: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: 'rgba(224, 169, 109, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sponsoredText: {
    color: '#E0A96D',
    fontSize: 10,
    fontWeight: '600',
  },
  adTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  ctaText: {
    color: '#888888',
    fontSize: 11,
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  premiumPillText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
  },
  premiumHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    opacity: 0.6,
  },
  premiumHintText: {
    color: '#FFD700',
    fontSize: 10,
  },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useShouldShowAds, fetchDirectAd, trackAdImpression, trackAdClick } from '../lib/ads';
import { hapticFeedback } from '../lib/haptics';
import type { AdServedPayload } from '@kephale/types';

interface AdBannerProps {
  style?: any;
}

/**
 * Adaptive Ad Banner Component
 * Displays direct Kephale sponsor or fallback banner for free users, renders null for Premium / Artists
 */
export default function AdBanner({ style }: AdBannerProps) {
  const showAds = useShouldShowAds();
  const [directAd, setDirectAd] = useState<AdServedPayload | null>(null);

  useEffect(() => {
    if (!showAds) return;
    let isMounted = true;
    (async () => {
      const ad = await fetchDirectAd('BANNER');
      if (isMounted && ad) {
        setDirectAd(ad);
        trackAdImpression(ad.id);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [showAds]);

  if (!showAds) {
    return null;
  }

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

  return (
    <View style={[styles.container, style]}>
      {/* Optional Thumbnail if available */}
      {directAd?.thumbnailUrl && (
        <Image
          source={{ uri: directAd.thumbnailUrl }}
          style={styles.thumbnail}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
        />
      )}

      {/* Banner Content */}
      <TouchableOpacity 
        style={styles.adContent}
        onPress={handleOpenAd}
        activeOpacity={0.85}
      >
        <View style={styles.badgeRow}>
          <Text style={styles.adBadge}>
            {directAd ? 'Sponsor' : 'Annonce'}
          </Text>
          <Text style={styles.adTitle} numberOfLines={1}>
            {directAd?.title || 'Kephale Music & Clips'}
          </Text>
        </View>
        <Text style={styles.adDescription} numberOfLines={1}>
          {directAd
            ? `${directAd.advertiserName} • ${directAd.ctaText}`
            : 'Découvrez les meilleurs artistes et sons exclusifs.'}
        </Text>
      </TouchableOpacity>

      {/* Remove Ads button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleGoPremium}
        activeOpacity={0.7}
      >
        <Ionicons name="sparkles" size={14} color="#E0A96D" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161616',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#262626',
  },
  thumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 10,
  },
  adContent: {
    flex: 1,
    paddingRight: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  adBadge: {
    backgroundColor: '#E0A96D',
    color: '#0D0D0D',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  adTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  adDescription: {
    color: '#888888',
    fontSize: 11,
  },
  closeButton: {
    padding: 6,
    backgroundColor: 'rgba(224, 169, 109, 0.12)',
    borderRadius: 8,
  },
});

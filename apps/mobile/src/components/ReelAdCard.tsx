import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { hapticFeedback } from '../lib/haptics';
import { fetchDirectAd, trackAdImpression, trackAdClick } from '../lib/ads';
import type { AdServedPayload } from '@kephale/types';

const { width: SCREEN_W } = Dimensions.get('window');

interface ReelAdCardProps {
  containerHeight: number;
  onSkip?: () => void;
}

export default function ReelAdCard({ containerHeight }: ReelAdCardProps) {
  const [directAd, setDirectAd] = useState<AdServedPayload | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const ad = await fetchDirectAd('REEL');
      if (isMounted && ad) {
        setDirectAd(ad);
        // Track verified impression
        trackAdImpression(ad.id);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

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
    <View style={[styles.container, { height: containerHeight }]}>
      {/* Background Media if Direct Ad exists */}
      {directAd?.mediaUrl ? (
        <Image
          source={{ uri: directAd.mediaUrl }}
          style={StyleSheet.absoluteFill}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
        />
      ) : (
        <LinearGradient
          colors={['#1F1135', '#0E0818', '#07040C']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dim overlay for readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient glowing circles */}
      <View style={styles.glowCircleTop} />
      <View style={styles.glowCircleBottom} />

      {/* Top Bar: Sponsored Badge */}
      <View style={styles.topBadgeRow}>
        <View style={styles.sponsoredBadge}>
          <Ionicons name="megaphone-outline" size={13} color="#E0A96D" />
          <Text style={styles.sponsoredText}>
            {directAd?.advertiserName ? `Sponsorisé • ${directAd.advertiserName}` : 'Sponsorisé'}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.premiumPill} 
          onPress={handleGoPremium}
          activeOpacity={0.8}
        >
          <Ionicons name="sparkles" size={13} color="#FFD700" />
          <Text style={styles.premiumPillText}>0 Pub avec Premium</Text>
        </TouchableOpacity>
      </View>

      {/* Central Content */}
      <View style={styles.centerContent}>
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={['#E0A96D', '#C08040']}
            style={styles.iconGradient}
          >
            <Ionicons name={directAd ? 'star' : 'musical-notes'} size={38} color="#0D0D0D" />
          </LinearGradient>
        </View>

        <Text style={styles.adTitle}>
          {directAd?.title || 'Découvrez de Nouveaux Talents sur Kephale'}
        </Text>
        <Text style={styles.adSubtitle}>
          {directAd
            ? `Profitez de cette offre spéciale proposée par ${directAd.advertiserName}.`
            : 'Soutenez directement vos artistes préférés en achetant leurs singles et albums exclusifs.'}
        </Text>

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleOpenAd}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#E0A96D', '#C08040']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>{directAd?.ctaText || 'En savoir plus'}</Text>
            <Ionicons name="arrow-forward" size={16} color="#0D0D0D" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Bottom Hint */}
      <View style={styles.bottomHintContainer}>
        <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.4)" />
        <Text style={styles.bottomHintText}>Glissez vers le bas pour le prochain Reel</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
    backgroundColor: '#0D0D0D',
  },
  glowCircleTop: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(224, 169, 109, 0.08)',
  },
  glowCircleBottom: {
    position: 'absolute',
    bottom: -50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(150, 70, 220, 0.1)',
  },
  topBadgeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(224, 169, 109, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(224, 169, 109, 0.3)',
    maxWidth: '55%',
  },
  sponsoredText: {
    color: '#E0A96D',
    fontSize: 12,
    fontWeight: '600',
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
  },
  premiumPillText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  centerContent: {
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  iconContainer: {
    marginBottom: 20,
    shadowColor: '#E0A96D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iconGradient: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  adSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 26,
    paddingHorizontal: 10,
  },
  ctaButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#E0A96D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  ctaText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomHintContainer: {
    alignItems: 'center',
    gap: 2,
  },
  bottomHintText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
  },
});

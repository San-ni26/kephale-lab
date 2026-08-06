import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { adminAdsAPI } from '../../../src/lib/api';
import { hapticFeedback } from '../../../src/lib/haptics';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CampaignAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: analyticsRes, isLoading, error } = useQuery({
    queryKey: ['campaignAnalytics', id],
    queryFn: () => adminAdsAPI.getCampaignAnalytics(id as string),
    enabled: !!id,
  });

  const analytics = analyticsRes?.data?.data;

  const handleShareReport = async () => {
    if (!analytics) return;
    await hapticFeedback.medium();

    const reportText = `*RAPPORT DE PERFORMANCE PUBLICITAIRE KEPHALE*
━━━━━━━━━━━━━━━━━━━━
*Campagne :* ${analytics.campaign.title}
*Annonceur :* ${analytics.campaign.advertiser?.company || analytics.campaign.advertiser?.name || (analytics.campaign.user ? `Créateur: ${analytics.campaign.user.name}` : 'Sponsor Direct')}
*Emplacement :* ${analytics.campaign.placement}
*Période :* Du ${new Date(analytics.campaign.startDate).toLocaleDateString()} au ${new Date(analytics.campaign.endDate).toLocaleDateString()}

*INDICATEURS CLÉS CERTIFIÉS :*
• Vues Réelles (Impressions) : ${analytics.totalImpressions.toLocaleString()}
• Clics / Interactions : ${analytics.totalClicks.toLocaleString()}
• Taux d'Engagement (CTR) : ${analytics.ctrPercent}%
• Taux de Complétion Vidéo (100%) : ${analytics.completionRatePercent}%

*TOP PAYS :*
${analytics.countriesBreakdown
  .slice(0, 5)
  .map((c: any) => `• ${c.country} : ${c.impressions} vues (${c.clicks} clics)`)
  .join('\n')}

━━━━━━━━━━━━━━━━━━━━
Certifié conforme par Kephale Ad Server Engine.`;


    Share.share({
      message: reportText,
      title: `Rapport Publicitaire - ${analytics.campaign.title}`,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#E0A96D" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (error || !analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rapport Introuvable</Text>
        </View>
        <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 60 }}>
          Impossible de charger les statistiques de cette campagne.
        </Text>
      </SafeAreaView>
    );
  }

  const { campaign } = analytics;
  const maxImp = Math.max(...analytics.countriesBreakdown.map((c: any) => c.impressions), 1);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques & Rapport Client</Text>
        <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShareReport}>
          <Ionicons name="share-outline" size={20} color="#E0A96D" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* CAMPAIGN HERO BANNER */}
        <View style={styles.campaignHero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroPlacement}>
              <Text style={styles.heroPlacementText}>{campaign.placement}</Text>
            </View>
            <View style={[styles.heroStatus, { borderColor: campaign.status === 'ACTIVE' ? '#34C759' : '#FF9500' }]}>
              <Text style={[styles.heroStatusText, { color: campaign.status === 'ACTIVE' ? '#34C759' : '#FF9500' }]}>
                {campaign.status}
              </Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{campaign.title}</Text>
          <Text style={styles.heroAdvertiser}>
            {campaign.advertiser?.company || campaign.advertiser?.name}
          </Text>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={13} color="#888" />
            <Text style={styles.dateText}>
              Du {new Date(campaign.startDate).toLocaleDateString()} au{' '}
              {new Date(campaign.endDate).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* METRICS GRID */}
        <Text style={styles.sectionTitle}>Métriques Clés Certifiées</Text>
        <View style={styles.grid}>
          {/* Impressions */}
          <View style={styles.gridCard}>
            <View style={styles.cardIcon}>
              <Ionicons name="eye" size={22} color="#007AFF" />
            </View>
            <Text style={styles.gridValue}>{analytics.totalImpressions.toLocaleString()}</Text>
            <Text style={styles.gridLabel}>Vues Réelles</Text>
            {campaign.maxImpressions && (
              <Text style={styles.gridSub}>Plafond : {campaign.maxImpressions.toLocaleString()}</Text>
            )}
          </View>

          {/* Clicks */}
          <View style={styles.gridCard}>
            <View style={styles.cardIcon}>
              <Ionicons name="finger-print" size={22} color="#34C759" />
            </View>
            <Text style={styles.gridValue}>{analytics.totalClicks.toLocaleString()}</Text>
            <Text style={styles.gridLabel}>Clics Générés</Text>
            <Text style={styles.gridSub}>Redirections</Text>
          </View>

          {/* CTR */}
          <View style={styles.gridCard}>
            <View style={styles.cardIcon}>
              <Ionicons name="trending-up" size={22} color="#FF9500" />
            </View>
            <Text style={styles.gridValue}>{analytics.ctrPercent}%</Text>
            <Text style={styles.gridLabel}>Taux de Clic (CTR)</Text>
            <Text style={styles.gridSub}>Ratio Clics/Vues</Text>
          </View>

          {/* Video Completion */}
          <View style={styles.gridCard}>
            <View style={styles.cardIcon}>
              <Ionicons name="checkmark-circle" size={22} color="#AF52DE" />
            </View>
            <Text style={styles.gridValue}>{analytics.completionRatePercent}%</Text>
            <Text style={styles.gridLabel}>Complétion Vidéo</Text>
            <Text style={styles.gridSub}>Vues intégrales (100%)</Text>
          </View>
        </View>

        {/* GEOGRAPHIC BREAKDOWN */}
        <Text style={styles.sectionTitle}>Répartition Géographique</Text>
        <View style={styles.sectionBox}>
          {analytics.countriesBreakdown.length === 0 ? (
            <Text style={styles.emptyNotice}>Données de localisation en cours de collecte...</Text>
          ) : (
            analytics.countriesBreakdown.map((geo: any) => {
              const barWidth = Math.min(100, Math.round((geo.impressions / maxImp) * 100));
              return (
                <View key={geo.country} style={styles.geoRow}>
                  <View style={styles.geoHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="globe-outline" size={14} color="#007AFF" />
                      <Text style={styles.geoCountry}>{geo.country}</Text>
                    </View>
                    <Text style={styles.geoStats}>
                      {geo.impressions.toLocaleString()} vues • {geo.clicks} clics
                    </Text>
                  </View>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${barWidth}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* DEVICE BREAKDOWN */}
        <Text style={styles.sectionTitle}>Répartition par Appareil</Text>
        <View style={styles.deviceRow}>
          {analytics.devicesBreakdown.map((dev: any) => (
            <View key={dev.device} style={styles.deviceCard}>
              <Ionicons
                name={dev.device.toLowerCase() === 'ios' ? 'logo-apple' : 'logo-android'}
                size={24}
                color="#E0A96D"
              />
              <Text style={styles.deviceLabel}>{dev.device.toUpperCase()}</Text>
              <Text style={styles.deviceValue}>{dev.impressions.toLocaleString()} vues</Text>
            </View>
          ))}
        </View>

        {/* 30 DAYS TIMELINE SUMMARY */}
        <Text style={styles.sectionTitle}>Activité des 30 Derniers Jours</Text>
        <View style={styles.sectionBox}>
          {analytics.dailyTrend.slice(-7).reverse().map((day: any) => (
            <View key={day.date} style={styles.dailyRow}>
              <Text style={styles.dailyDate}>{day.date}</Text>
              <View style={styles.dailyCounts}>
                <Text style={styles.dailyImp}>{day.impressions} vues</Text>
                <Text style={styles.dailyClk}>{day.clicks} clics</Text>
              </View>
            </View>
          ))}
        </View>

        {/* SHARE REPORT BUTTON */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareReport} activeOpacity={0.85}>
          <Ionicons name="share-social" size={18} color="#0D0D0D" />
          <Text style={styles.shareBtnText}>Partager le Rapport au Client</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  shareHeaderBtn: { padding: 6, backgroundColor: '#1A1A1A', borderRadius: 8 },
  content: { padding: 16, paddingBottom: 60 },

  // Hero
  campaignHero: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#242424',
    marginBottom: 24,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  heroPlacement: {
    backgroundColor: 'rgba(224, 169, 109, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroPlacementText: { color: '#E0A96D', fontSize: 11, fontWeight: '800' },
  heroStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  heroStatusText: { fontSize: 10, fontWeight: '800' },
  heroTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  heroAdvertiser: { color: '#AAA', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { color: '#777', fontSize: 12 },

  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 10 },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  gridCard: {
    width: (SCREEN_W - 44) / 2,
    backgroundColor: '#121212',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202020',
    marginBottom: 12,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  gridValue: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  gridLabel: { color: '#E0A96D', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  gridSub: { color: '#666', fontSize: 11 },

  // Boxes
  sectionBox: {
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202020',
    marginBottom: 20,
  },
  emptyNotice: { color: '#666', fontSize: 12, textAlign: 'center', paddingVertical: 10 },

  geoRow: { marginBottom: 14 },
  geoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  geoCountry: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  geoStats: { color: '#888', fontSize: 12 },
  barBg: { height: 6, backgroundColor: '#202020', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#E0A96D', borderRadius: 3 },

  deviceRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  deviceCard: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202020',
  },
  deviceLabel: { color: '#FFF', fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  deviceValue: { color: '#888', fontSize: 12 },

  dailyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  dailyDate: { color: '#BBB', fontSize: 12 },
  dailyCounts: { flexDirection: 'row', gap: 14 },
  dailyImp: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  dailyClk: { color: '#34C759', fontSize: 12, fontWeight: '600' },

  // Share CTA
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E0A96D',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 10,
    marginBottom: 40,
  },
  shareBtnText: { color: '#0D0D0D', fontSize: 15, fontWeight: '800' },
});

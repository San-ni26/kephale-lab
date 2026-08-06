import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { adsAPI } from '../../src/lib/api';
import { hapticFeedback } from '../../src/lib/haptics';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CreatorCampaignAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: analyticsRes, isLoading, refetch } = useQuery({
    queryKey: ['myCampaignAnalytics', id],
    queryFn: () => adsAPI.getMyAnalytics(id as string),
    enabled: !!id,
  });

  const data = analyticsRes?.data?.data;
  const campaign = data?.campaign;

  const handleShareReport = async () => {
    if (!campaign || !data) return;
    await hapticFeedback.medium();

    const reportText = `RAPPORT DE PERFORMANCE BOOST KEPHALE
----------------------------------------
Contenu : ${campaign.title}
Objectif : ${campaign.maxImpressions ? campaign.maxImpressions.toLocaleString() + ' Vues' : 'Illimité'}
----------------------------------------
RÉSULTATS CERTIFIÉS :
• Vues Réelles Délivrées : ${data.totalImpressions.toLocaleString()}
• Clics & Écoutes Directes : ${data.totalClicks.toLocaleString()}
• Taux d'Engagement (CTR) : ${data.ctrPercent}%
• Taux de Complétion Vidéo : ${data.completionRatePercent}%

TOP PAYS :
${data.countriesBreakdown?.map((c: any) => `• ${c.country} : ${c.impressions} vues (${c.clicks} clics)`).join('\n') || 'Mondial'}

Généré par la plateforme officielle Kephale.`;


    try {
      await Share.share({
        message: reportText,
        title: `Rapport Boost - ${campaign.title}`,
      });
    } catch (err) {
      console.log('Share error', err);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E0A96D" />
        <Text style={styles.loadingText}>Génération des statistiques en direct...</Text>
      </SafeAreaView>
    );
  }

  if (!campaign || !data) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
        <Text style={styles.errorText}>Rapport introuvable ou accès non autorisé.</Text>
        <TouchableOpacity style={styles.backButtonSimple} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const progress = campaign.maxImpressions
    ? Math.min(100, Math.round((data.totalImpressions / campaign.maxImpressions) * 100))
    : 100;

  const remaining = campaign.maxImpressions
    ? Math.max(0, campaign.maxImpressions - data.totalImpressions)
    : 0;

  const itemThumb =
    campaign.thumbnailUrl ||
    campaign.track?.coverUrl ||
    campaign.album?.coverUrl ||
    campaign.video?.thumbnailUrl ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400';

  const maxCountryImp = Math.max(...(data.countriesBreakdown?.map((c: any) => c.impressions) || [1]), 1);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques du Boost</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareReport}>
          <Ionicons name="share-outline" size={20} color="#E0A96D" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* HERO CAMPAIGN PREVIEW */}
        <View style={styles.heroCard}>
          <VideoThumbnail
            sourceUrl={campaign.thumbnailUrl || campaign.track?.coverUrl || campaign.album?.coverUrl || campaign.video?.thumbnailUrl}
            videoUrl={campaign.video?.videoUrl}
            style={styles.heroThumb}
            resizeMode="cover"
          />
          <View style={{ flex: 1, marginLeft: 14 }}>

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      campaign.status === 'ACTIVE'
                        ? 'rgba(52, 199, 89, 0.15)'
                        : campaign.status === 'COMPLETED'
                        ? 'rgba(175, 82, 222, 0.15)'
                        : 'rgba(255, 149, 0, 0.15)',
                    borderColor:
                      campaign.status === 'ACTIVE'
                        ? '#34C759'
                        : campaign.status === 'COMPLETED'
                        ? '#AF52DE'
                        : '#FF9500',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        campaign.status === 'ACTIVE'
                          ? '#34C759'
                          : campaign.status === 'COMPLETED'
                          ? '#AF52DE'
                          : '#FF9500',
                    },
                  ]}
                >
                  {campaign.status === 'ACTIVE'
                    ? 'EN DIFFUSION'
                    : campaign.status === 'COMPLETED'
                    ? 'TERMINÉ'
                    : 'EN PAUSE'}
                </Text>
              </View>
              <Text style={styles.packageTag}>
                {campaign.boostPackage ? `Pack ${campaign.boostPackage}` : 'Boost'}
              </Text>
            </View>

            <Text style={styles.heroTitle} numberOfLines={2}>
              {campaign.title.replace(/^Boost( Morceau| Album)?: /, '')}
            </Text>

            <Text style={styles.heroDates}>
              Du {new Date(campaign.startDate).toLocaleDateString()} au{' '}
              {new Date(campaign.endDate).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* PROGRESS GAUGE */}
        <View style={styles.gaugeCard}>
          <View style={styles.gaugeHeader}>
            <View>
              <Text style={styles.gaugeLabel}>Livraison des Vues</Text>
              <Text style={styles.gaugeNumbers}>
                {data.totalImpressions.toLocaleString()}{' '}
                <Text style={styles.gaugeNumbersSub}>
                  / {campaign.maxImpressions ? campaign.maxImpressions.toLocaleString() : '∞'} vues
                </Text>
              </Text>
            </View>
            <Text style={styles.gaugePercent}>{progress}%</Text>
          </View>

          <View style={styles.gaugeBarBg}>
            <View style={[styles.gaugeBarFill, { width: `${progress}%` }]} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Ionicons
              name={remaining > 0 ? 'flash-outline' : 'checkmark-circle-outline'}
              size={14}
              color={remaining > 0 ? '#E0A96D' : '#34C759'}
            />
            <Text style={styles.remainingText}>
              {remaining > 0
                ? `Encore ${remaining.toLocaleString()} vues garanties à distribuer.`
                : 'Objectif de diffusion atteint à 100% !'}
            </Text>
          </View>

        </View>

        {/* METRICS 2x2 GRID */}
        <Text style={styles.sectionTitle}>Indicateurs Clés de Performance</Text>
        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="eye" size={20} color="#007AFF" />
            </View>
            <Text style={styles.metricBig}>{data.totalImpressions.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Vues Réelles Délivrées</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="play" size={20} color="#34C759" />
            </View>
            <Text style={styles.metricBig}>{data.totalClicks.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Clics & Écoutes Générées</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="trending-up" size={20} color="#FF9500" />
            </View>
            <Text style={styles.metricBig}>{data.ctrPercent}%</Text>
            <Text style={styles.metricLabel}>Taux de Clic (CTR)</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="checkmark-done" size={20} color="#AF52DE" />
            </View>
            <Text style={styles.metricBig}>{data.completionRatePercent}%</Text>
            <Text style={styles.metricLabel}>Complétion Vidéo / Écoute</Text>
          </View>
        </View>

        {/* AUDIENCE GEO BREAKDOWN */}
        <Text style={styles.sectionTitle}>Répartition Géographique de l’Audience</Text>
        <View style={styles.geoCard}>
          {(!data.countriesBreakdown || data.countriesBreakdown.length === 0) ? (
            <Text style={styles.noDataText}>Diffusion en cours d’agrégation...</Text>
          ) : (
            data.countriesBreakdown.map((item: any, idx: number) => {
              const barWidth = Math.max(8, Math.round((item.impressions / maxCountryImp) * 100));
              return (
                <View key={idx} style={styles.geoRow}>
                  <View style={styles.geoInfo}>
                    <Text style={styles.geoCountry}>{item.country}</Text>
                    <Text style={styles.geoCount}>
                      {item.impressions.toLocaleString()} vues • {item.clicks} clics
                    </Text>
                  </View>
                  <View style={styles.geoBarBg}>
                    <View style={[styles.geoBarFill, { width: `${barWidth}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* DEVICE BREAKDOWN */}
        <Text style={styles.sectionTitle}>Appareils des Spectateurs</Text>
        <View style={styles.deviceRow}>
          {data.devicesBreakdown?.map((d: any, idx: number) => (
            <View key={idx} style={styles.deviceCard}>
              <Ionicons
                name={d.device?.toLowerCase().includes('ios') ? 'logo-apple' : 'logo-android'}
                size={22}
                color="#FFF"
              />
              <Text style={styles.deviceVal}>{d.impressions.toLocaleString()} vues</Text>
              <Text style={styles.deviceLabel}>{d.device}</Text>
            </View>
          ))}
        </View>

        {/* EXPORT ACTION */}
        <TouchableOpacity style={styles.exportBtn} onPress={handleShareReport} activeOpacity={0.85}>
          <Ionicons name="share-social" size={18} color="#0D0D0D" />
          <Text style={styles.exportBtnText}>Exporter & Partager le Rapport</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#888', marginTop: 14, fontSize: 13 },
  errorText: { color: '#FF3B30', marginTop: 12, fontSize: 14, textAlign: 'center' },
  backButtonSimple: {
    marginTop: 20,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: { color: '#FFF', fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  shareBtn: { padding: 6, backgroundColor: '#161616', borderRadius: 8 },
  content: { padding: 16, paddingBottom: 60 },

  // Hero
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242424',
    marginBottom: 16,
  },
  heroThumb: { width: 70, height: 70, borderRadius: 12, backgroundColor: '#222' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  packageTag: { color: '#E0A96D', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  heroDates: { color: '#666', fontSize: 11 },

  // Gauge
  gaugeCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    marginBottom: 24,
  },
  gaugeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  gaugeLabel: { color: '#888', fontSize: 12, marginBottom: 2 },
  gaugeNumbers: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  gaugeNumbersSub: { color: '#666', fontSize: 14, fontWeight: '500' },
  gaugePercent: { color: '#E0A96D', fontSize: 22, fontWeight: '800' },
  gaugeBarBg: { height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  gaugeBarFill: { height: '100%', backgroundColor: '#E0A96D', borderRadius: 4 },
  remainingText: { color: '#AAA', fontSize: 12, fontStyle: 'italic' },

  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 12 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  metricCard: {
    width: (SCREEN_W - 44) / 2,
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202020',
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricBig: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  metricLabel: { color: '#888', fontSize: 11 },

  // Geo
  geoCard: {
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202020',
    marginBottom: 24,
    gap: 14,
  },
  geoRow: {},
  geoInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  geoCountry: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  geoCount: { color: '#888', fontSize: 12 },
  geoBarBg: { height: 6, backgroundColor: '#202020', borderRadius: 3, overflow: 'hidden' },
  geoBarFill: { height: '100%', backgroundColor: '#007AFF', borderRadius: 3 },
  noDataText: { color: '#666', fontSize: 12, textAlign: 'center', paddingVertical: 10 },

  // Device
  deviceRow: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  deviceCard: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202020',
    alignItems: 'center',
  },
  deviceVal: { color: '#FFF', fontSize: 14, fontWeight: '800', marginTop: 6 },
  deviceLabel: { color: '#888', fontSize: 11, marginTop: 2 },

  // Export
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E0A96D',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  exportBtnText: { color: '#0D0D0D', fontSize: 14, fontWeight: '800' },
});

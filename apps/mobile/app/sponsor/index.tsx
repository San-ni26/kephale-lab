import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adsAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import { hapticFeedback } from '../../src/lib/haptics';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CreatorSponsorScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: campaignsRes, isLoading, refetch } = useQuery({
    queryKey: ['myCampaigns'],
    queryFn: () => adsAPI.getMyCampaigns(),
  });

  const campaigns = campaignsRes?.data?.data || [];

  const totalImpressions = campaigns.reduce((sum: number, c: any) => sum + (c.currentImpressions || 0), 0);
  const totalClicks = campaigns.reduce((sum: number, c: any) => sum + (c.currentClicks || 0), 0);
  const activeCount = campaigns.filter((c: any) => c.status === 'ACTIVE').length;

  const handleCreateBoost = async () => {
    await hapticFeedback.light();
    router.push('/sponsor/create' as any);
  };

  const handleViewAnalytics = async (id: string) => {
    await hapticFeedback.light();
    router.push(`/sponsor/${id}` as any);
  };

  const handleBuyTokens = async () => {
    await hapticFeedback.light();
    router.push('/buy-tokens');
  };

  const getPlacementLabel = (p: string) => {
    switch (p) {
      case 'REEL':
        return 'Reel';
      case 'TRACK_BOOST':
        return 'Morceau';
      case 'ALBUM_BOOST':
        return 'Album';
      case 'CLIP_PREROLL':
        return 'Clip Vidéo';
      default:
        return 'Contenu';
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Boosts & Sponsoring</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            hapticFeedback.light();
            refetch();
          }}
        >
          <Ionicons name="refresh" size={20} color="#E0A96D" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* TOKEN BALANCE & TOP ACTION */}
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Mon Solde Jetons</Text>
            <View style={styles.balanceRow}>
              <Ionicons name="sparkles" size={20} color="#FFD700" />
              <Text style={styles.balanceValue}>{user?.tokenBalance || 0} Jetons</Text>
            </View>
          </View>

          <View style={styles.balanceActions}>
            <TouchableOpacity style={styles.rechargeBtn} onPress={handleBuyTokens} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={16} color="#E0A96D" />
              <Text style={styles.rechargeBtnText}>Recharger</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.newBoostBtn} onPress={handleCreateBoost} activeOpacity={0.85}>
              <Ionicons name="rocket" size={16} color="#0D0D0D" />
              <Text style={styles.newBoostBtnText}>Nouveau Boost</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* OVERVIEW KPIS */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Ionicons name="eye-outline" size={20} color="#007AFF" />
            <Text style={styles.kpiValue}>{totalImpressions.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Vues Générées</Text>
          </View>

          <View style={styles.kpiCard}>
            <Ionicons name="play-outline" size={20} color="#34C759" />
            <Text style={styles.kpiValue}>{totalClicks.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Interactions / Écoutes</Text>
          </View>

          <View style={styles.kpiCard}>
            <Ionicons name="flash-outline" size={20} color="#FF9500" />
            <Text style={styles.kpiValue}>{activeCount}</Text>
            <Text style={styles.kpiLabel}>Boosts Actifs</Text>
          </View>
        </View>

        {/* CAMPAIGN LIST */}
        <Text style={styles.sectionTitle}>Mes Campagnes ({campaigns.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color="#E0A96D" style={{ marginTop: 40 }} />
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="rocket-outline" size={36} color="#E0A96D" />
            </View>
            <Text style={styles.emptyTitle}>Propulsez votre visibilité</Text>
            <Text style={styles.emptySub}>
              {user?.role === 'ARTIST'
                ? 'Sponsorisez vos morceaux, albums et clips pour toucher des milliers de nouveaux fans.'
                : 'Boostez vos Reels pour multiplier vos vues et gagner en notoriété sur Kephale.'}
            </Text>
            <TouchableOpacity style={styles.emptyActionBtn} onPress={handleCreateBoost} activeOpacity={0.85}>
              <Ionicons name="rocket" size={18} color="#0D0D0D" />
              <Text style={styles.emptyActionBtnText}>Lancer mon premier Boost</Text>
            </TouchableOpacity>
          </View>
        ) : (
          campaigns.map((c: any) => {
            const progress = c.maxImpressions
              ? Math.min(100, Math.round((c.currentImpressions / c.maxImpressions) * 100))
              : 100;
            const itemThumbnail =
              c.thumbnailUrl ||
              c.track?.coverUrl ||
              c.album?.coverUrl ||
              c.video?.thumbnailUrl ||
              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400';

            const ctr =
              c.currentImpressions > 0
                ? ((c.currentClicks / c.currentImpressions) * 100).toFixed(1)
                : '0.0';

            return (
              <View key={c.id} style={styles.campaignCard}>
                {/* Header Row */}
                <View style={styles.cardTopRow}>
                  <VideoThumbnail
                    sourceUrl={c.thumbnailUrl || c.track?.coverUrl || c.album?.coverUrl || c.video?.thumbnailUrl}
                    videoUrl={c.video?.videoUrl}
                    style={styles.itemThumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>

                    <View style={styles.badgeRow}>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{getPlacementLabel(c.placement)}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            borderColor:
                              c.status === 'ACTIVE'
                                ? '#34C759'
                                : c.status === 'COMPLETED'
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
                                c.status === 'ACTIVE'
                                  ? '#34C759'
                                  : c.status === 'COMPLETED'
                                  ? '#AF52DE'
                                  : '#FF9500',
                            },
                          ]}
                        >
                          {c.status === 'ACTIVE'
                            ? 'EN DIFFUSION'
                            : c.status === 'COMPLETED'
                            ? 'TERMINÉ'
                            : 'EN PAUSE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {c.title.replace(/^Boost( Morceau| Album)?: /, '')}
                    </Text>
                    <Text style={styles.cardDate}>
                      Lancé le {new Date(c.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      Vues délivrées : {c.currentImpressions.toLocaleString()}{' '}
                      {c.maxImpressions ? `/ ${c.maxImpressions.toLocaleString()}` : ''}
                    </Text>
                    <Text style={styles.progressPercent}>{progress}%</Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                  </View>
                </View>

                {/* Metrics Footer */}
                <View style={styles.cardFooter}>
                  <View style={styles.metricTiny}>
                    <Text style={styles.metricTinyLabel}>Clics / Écoutes</Text>
                    <Text style={styles.metricTinyValue}>{c.currentClicks}</Text>
                  </View>
                  <View style={styles.metricTiny}>
                    <Text style={styles.metricTinyLabel}>CTR</Text>
                    <Text style={styles.metricTinyValue}>{ctr}%</Text>
                  </View>
                  <View style={styles.metricTiny}>
                    <Text style={styles.metricTinyLabel}>Coût</Text>
                    <Text style={styles.metricTinyValue}>{c.costTokens || 0} Jetons</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.detailBtn}
                    onPress={() => handleViewAnalytics(c.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="stats-chart" size={14} color="#0D0D0D" />
                    <Text style={styles.detailBtnText}>Statistiques</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
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
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  refreshBtn: { padding: 6, backgroundColor: '#161616', borderRadius: 8 },
  content: { padding: 16, paddingBottom: 60 },

  // Balance Card
  balanceCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    marginBottom: 16,
  },
  balanceLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  balanceValue: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  balanceActions: { flexDirection: 'row', gap: 10 },
  rechargeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(224, 169, 109, 0.12)',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(224, 169, 109, 0.3)',
  },
  rechargeBtnText: { color: '#E0A96D', fontSize: 13, fontWeight: '700' },
  newBoostBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E0A96D',
    paddingVertical: 10,
    borderRadius: 10,
  },
  newBoostBtnText: { color: '#0D0D0D', fontSize: 13, fontWeight: '800' },

  // KPIs
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202020',
    alignItems: 'center',
  },
  kpiValue: { color: '#FFF', fontSize: 16, fontWeight: '800', marginTop: 4 },
  kpiLabel: { color: '#888', fontSize: 10, marginTop: 2, textAlign: 'center' },

  sectionTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 14 },

  // Campaign Card
  campaignCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 14,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  itemThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#222' },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  typeBadge: {
    backgroundColor: '#202020',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: { color: '#E0A96D', fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 9, fontWeight: '800' },
  cardTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardDate: { color: '#666', fontSize: 11 },

  // Progress
  progressContainer: { marginBottom: 14 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#AAA', fontSize: 12 },
  progressPercent: { color: '#E0A96D', fontSize: 12, fontWeight: '700' },
  progressBarBg: { height: 6, backgroundColor: '#202020', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#E0A96D', borderRadius: 3 },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  metricTiny: { alignItems: 'center' },
  metricTinyLabel: { color: '#666', fontSize: 10, marginBottom: 2 },
  metricTinyValue: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0A96D',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  detailBtnText: { color: '#0D0D0D', fontSize: 11, fontWeight: '800' },

  // Empty State
  emptyState: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202020',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(224, 169, 109, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptySub: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0A96D',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
  },
  emptyActionBtnText: { color: '#0D0D0D', fontSize: 14, fontWeight: '800' },
});

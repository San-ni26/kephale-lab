import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { artistsAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';

function MetricCard({ label, value, subtitle, color = '#FF5A00', icon }: {
  label: string; value: string | number; subtitle?: string; color?: string; icon: string;
}) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={[styles.metricIconBox, { backgroundColor: `${color}22` }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
      </View>
      <Text style={styles.metricValue}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export default function ArtistStatsScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['artist-dashboard'],
    queryFn: () => artistsAPI.getDashboard(),
    enabled: user?.role === 'ARTIST',
  });

  const dashboard = data?.data?.data;
  const stats = dashboard?.stats;
  const topTracks = dashboard?.topTracks ?? [];
  const recentPurchases = dashboard?.recentPurchases ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FF5A00" />}
        >
          {/* Écoutes & Vues */}
          <Text style={styles.sectionTitle}>Audience</Text>
          <View style={styles.metricsGrid}>
            <MetricCard label="Écoutes totales" value={stats?.totalPlays ?? 0} icon="headset" color="#FF5A00" />
            <MetricCard label="Vues vidéo" value={stats?.totalViews ?? 0} icon="play-circle" color="#8B5CF6" />
            <MetricCard label="Abonnés" value={stats?.totalFollowers ?? 0} icon="people" color="#06B6D4" />
            <MetricCard label="Morceaux actifs" value={stats?.totalTracks ?? 0} icon="musical-notes" color="#F59E0B" />
            <MetricCard label="Albums" value={stats?.totalAlbums ?? 0} icon="albums" color="#EC4899" />
            <MetricCard label="Vidéos" value={stats?.totalVideos ?? 0} icon="film" color="#10B981" />
          </View>

          {/* Revenus */}
          <Text style={styles.sectionTitle}>Revenus</Text>
          <View style={styles.revenueBox}>
            <View style={styles.revenueRow}>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Total gagné</Text>
                <Text style={[styles.revenueValue, { color: '#10B981' }]}>
                  {(stats?.totalEarnings ?? 0).toLocaleString()} XOF
                </Text>
              </View>
              <View style={styles.revenueDivider} />
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>En attente</Text>
                <Text style={[styles.revenueValue, { color: '#F59E0B' }]}>
                  {(stats?.pendingPayout ?? 0).toLocaleString()} XOF
                </Text>
              </View>
              <View style={styles.revenueDivider} />
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Revenus totaux</Text>
                <Text style={[styles.revenueValue, { color: '#FF5A00' }]}>
                  {(stats?.totalRevenue ?? 0).toLocaleString()} XOF
                </Text>
              </View>
            </View>
          </View>

          {/* Top Morceaux */}
          {topTracks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Top morceaux</Text>
              <View style={styles.topList}>
                {topTracks.map((track: any, idx: number) => (
                  <View key={track.id} style={styles.topRow}>
                    <View style={[styles.rankBadge, idx === 0 && styles.rankGold, idx === 1 && styles.rankSilver, idx === 2 && styles.rankBronze]}>
                      <Text style={styles.rankText}>{idx + 1}</Text>
                    </View>
                    <View style={styles.topInfo}>
                      <Text style={styles.topTitle} numberOfLines={1}>{track.title}</Text>
                      <View style={styles.topMeta}>
                        <Ionicons name="headset-outline" size={12} color="#888" />
                        <Text style={styles.topMetaText}>{track.plays.toLocaleString()} écoutes</Text>
                        {track.price > 0 && <Text style={styles.topPrice}>{track.price.toLocaleString()} XOF</Text>}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Achats récents */}
          {recentPurchases.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Achats récents</Text>
              <View style={styles.purchaseList}>
                {recentPurchases.map((purchase: any) => (
                  <View key={purchase.id} style={styles.purchaseRow}>
                    <View style={styles.purchaseIcon}>
                      <Ionicons name="card-outline" size={18} color="#10B981" />
                    </View>
                    <View style={styles.purchaseInfo}>
                      <Text style={styles.purchaseTitle} numberOfLines={1}>
                        {purchase.track?.title || purchase.album?.title || 'Achat'}
                      </Text>
                      <Text style={styles.purchaseBuyer}>{purchase.user?.name}</Text>
                    </View>
                    <Text style={styles.purchaseAmount}>+{purchase.artistAmount?.toLocaleString()} XOF</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  sectionTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 14,
  },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  metricCard: {
    width: '47%',
    marginHorizontal: '1.5%',
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 3,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#222',
    borderRightColor: '#222',
    borderBottomColor: '#222',
  },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  metricLabel: { color: '#888', fontSize: 12, fontWeight: '500', flex: 1 },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricValue: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  metricSubtitle: { color: '#666', fontSize: 11, marginTop: 4 },

  revenueBox: {
    marginHorizontal: 16,
    backgroundColor: '#141414',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  revenueRow: { flexDirection: 'row', alignItems: 'center' },
  revenueItem: { flex: 1, alignItems: 'center' },
  revenueDivider: { width: 1, height: 40, backgroundColor: '#2A2A2A' },
  revenueLabel: { color: '#888', fontSize: 11, fontWeight: '500', marginBottom: 6, textAlign: 'center' },
  revenueValue: { fontSize: 16, fontWeight: '800', textAlign: 'center' },

  topList: { marginHorizontal: 16, backgroundColor: '#141414', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rankGold: { backgroundColor: '#F59E0B' },
  rankSilver: { backgroundColor: '#9CA3AF' },
  rankBronze: { backgroundColor: '#92400E' },
  rankText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  topInfo: { flex: 1 },
  topTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  topMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topMetaText: { color: '#888', fontSize: 12 },
  topPrice: { color: '#FF5A00', fontSize: 12, fontWeight: '700' },

  purchaseList: { marginHorizontal: 16, backgroundColor: '#141414', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  purchaseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B98122',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  purchaseInfo: { flex: 1 },
  purchaseTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  purchaseBuyer: { color: '#888', fontSize: 12, marginTop: 2 },
  purchaseAmount: { color: '#10B981', fontSize: 14, fontWeight: '700' },
});

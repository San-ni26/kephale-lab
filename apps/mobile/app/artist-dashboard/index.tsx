import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores';
import { artistsAPI } from '../../src/lib/api';
import type { ArtistDashboard } from '@kephale/types';

const { width: SCREEN_W } = Dimensions.get('window');

function StatCard({ label, value, icon, color = '#FF5A00' }: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, color = '#FF5A00' }: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ArtistDashboardScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['artist-dashboard'],
    queryFn: () => artistsAPI.getDashboard(),
    enabled: user?.role === 'ARTIST' || user?.role === 'ADMIN',
  });

  const dashboard: ArtistDashboard | undefined = data?.data?.data;

  if (user?.role !== 'ARTIST' && user?.role !== 'ADMIN') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="mic-off-outline" size={60} color="#444" />
          <Text style={styles.emptyTitle}>Accès réservé aux artistes</Text>
          <TouchableOpacity style={styles.cta} onPress={() => router.push('/profile/become-artist')}>
            <Text style={styles.ctaText}>Devenir Artiste</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mon Studio</Text>
        <TouchableOpacity onPress={() => router.push('/artist-dashboard/stats')} style={styles.headerRight}>
          <Ionicons name="stats-chart" size={22} color="#FF5A00" />
        </TouchableOpacity>
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
          {/* Artist Identity */}
          <View style={styles.artistBanner}>
            <View style={styles.artistAvatarWrap}>
              {dashboard?.artist?.avatar || user?.avatar ? (
                <Image
                  source={{ uri: dashboard?.artist?.avatar || user?.avatar }}
                  style={styles.artistAvatar}
                />
              ) : (
                <View style={[styles.artistAvatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{user?.name?.[0] || 'A'}</Text>
                </View>
              )}
              {dashboard?.artist?.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#000" />
                </View>
              )}
            </View>
            <View style={styles.artistInfo}>
              <Text style={styles.artistName}>{dashboard?.artist?.stageName || user?.name}</Text>
              {user?.username && (
                <Text style={styles.artistUsername}>
                  {user.username.startsWith('@') ? user.username : `@${user.username}`}
                </Text>
              )}
              <Text style={styles.artistSub}>
                {dashboard?.stats?.totalFollowers?.toLocaleString() || 0} abonnés
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => router.push('/artist-dashboard/edit-profile')}
            >
              <Text style={styles.editProfileText}>Modifier</Text>
            </TouchableOpacity>
          </View>

          {/* Stats Grid */}
          <Text style={styles.sectionTitle}>Statistiques</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Écoutes" value={dashboard?.stats?.totalPlays ?? 0}
              icon="headset" color="#FF5A00"
            />
            <StatCard
              label="Vues vidéo" value={dashboard?.stats?.totalViews ?? 0}
              icon="play-circle" color="#8B5CF6"
            />
            <StatCard
              label="Abonnés" value={dashboard?.stats?.totalFollowers ?? 0}
              icon="people" color="#06B6D4"
            />
            <StatCard
              label="Revenus (XOF)" value={`${(dashboard?.stats?.totalRevenue ?? 0).toLocaleString()}`}
              icon="cash" color="#10B981"
            />
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.quickActions}>
            <QuickAction
              icon="musical-note"
              label="Uploader un titre"
              onPress={() => router.push('/artist-dashboard/upload-track')}
              color="#FF5A00"
            />
            <QuickAction
              icon="albums"
              label="Créer un album"
              onPress={() => router.push('/artist-dashboard/create-album')}
              color="#8B5CF6"
            />
            <QuickAction
              icon="film"
              label="Poster un clip / reel"
              onPress={() => router.push('/artist-dashboard/upload-video')}
              color="#06B6D4"
            />
            <QuickAction
              icon="radio"
              label="Lancer un live"
              onPress={() => router.push('/live/create')}
              color="#EF4444"
            />
          </View>

          {/* My Content */}
          <View style={styles.contentNav}>
            <TouchableOpacity
              style={styles.contentNavItem}
              onPress={() => router.push('/artist-dashboard/my-tracks')}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: '#FF5A0022' }]}>
                  <Ionicons name="musical-notes" size={20} color="#FF5A00" />
                </View>
                <View>
                  <Text style={styles.contentNavTitle}>Mes Morceaux</Text>
                  <Text style={styles.contentNavSub}>{dashboard?.stats?.totalTracks ?? 0} titres</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contentNavItem}
              onPress={() => router.push('/artist-dashboard/my-albums')}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: '#8B5CF622' }]}>
                  <Ionicons name="albums" size={20} color="#8B5CF6" />
                </View>
                <View>
                  <Text style={styles.contentNavTitle}>Mes Albums</Text>
                  <Text style={styles.contentNavSub}>{dashboard?.stats?.totalAlbums ?? 0} albums</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contentNavItem}
              onPress={() => router.push('/artist-dashboard/my-videos')}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: '#06B6D422' }]}>
                  <Ionicons name="film" size={20} color="#06B6D4" />
                </View>
                <View>
                  <Text style={styles.contentNavTitle}>Mes Vidéos</Text>
                  <Text style={styles.contentNavSub}>{dashboard?.stats?.totalVideos ?? 0} vidéos</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.contentNavItem, { backgroundColor: '#181510', borderColor: 'rgba(224, 169, 109, 0.4)', borderWidth: 1 }]}
              onPress={() => router.push('/sponsor' as any)}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: 'rgba(224, 169, 109, 0.2)' }]}>
                  <Ionicons name="rocket" size={20} color="#E0A96D" />
                </View>
                <View>
                  <Text style={[styles.contentNavTitle, { color: '#E0A96D', fontWeight: '800' }]}>
                    Sponsoring & Boosts
                  </Text>
                  <Text style={styles.contentNavSub}>Propulser morceaux, clips & voir statistiques</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#E0A96D" />
            </TouchableOpacity>
          </View>

          {/* Top Tracks */}
          {(dashboard?.topTracks?.length ?? 0) > 0 && (
            <View style={styles.topSection}>
              <Text style={styles.sectionTitle}>Top morceaux</Text>
              {dashboard!.topTracks.map((track, idx) => (
                <View key={track.id} style={styles.topTrackRow}>
                  <Text style={styles.topTrackRank}>#{idx + 1}</Text>
                  <Image source={{ uri: track.coverUrl }} style={styles.topTrackCover} />
                  <View style={styles.topTrackInfo}>
                    <Text style={styles.topTrackTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.topTrackPlays}>{track.plays.toLocaleString()} écoutes</Text>
                  </View>
                  {track.price > 0 && (
                    <Text style={styles.topTrackPrice}>{track.price} XOF</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Finances */}
          <Text style={styles.sectionTitle}>Finances</Text>
          <View style={styles.contentNav}>
            <TouchableOpacity
              style={styles.contentNavItem}
              onPress={() => router.push('/studio/sales' as any)}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: '#10B98122' }]}>
                  <Ionicons name="cart" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.contentNavTitle}>Historique des Ventes</Text>
                  <Text style={styles.contentNavSub}>Voir qui a acheté vos contenus</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.contentNavItem}
              onPress={() => router.push('/studio/revenue' as any)}
            >
              <View style={styles.contentNavLeft}>
                <View style={[styles.contentNavIcon, { backgroundColor: '#F59E0B22' }]}>
                  <Ionicons name="wallet" size={20} color="#F59E0B" />
                </View>
                <View>
                  <Text style={styles.contentNavTitle}>Revenus & Retraits</Text>
                  <Text style={styles.contentNavSub}>Gérer vos gains et paiements</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Payout pending */}
          {(dashboard?.stats?.pendingPayout ?? 0) > 0 && (
            <TouchableOpacity style={styles.payoutBanner} onPress={() => router.push('/studio/revenue' as any)}>
              <Ionicons name="cash-outline" size={24} color="#10B981" />
              <View style={styles.payoutInfo}>
                <Text style={styles.payoutTitle}>Versement en attente</Text>
                <Text style={styles.payoutAmount}>
                  {dashboard!.stats.pendingPayout.toLocaleString()} XOF
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#10B981" />
            </TouchableOpacity>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

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
  headerRight: { width: 36, alignItems: 'flex-end' },

  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 24 },
  cta: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  // Artist Banner
  artistBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
  },
  artistAvatarWrap: { position: 'relative' },
  artistAvatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  artistInfo: { flex: 1, marginLeft: 14 },
  artistName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  artistUsername: { color: '#A0A0A0', fontSize: 13, marginTop: 2 },
  artistSub: { color: '#888', fontSize: 13, marginTop: 2 },
  editProfileBtn: {
    borderWidth: 1,
    borderColor: '#FF5A00',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  editProfileText: { color: '#FF5A00', fontSize: 13, fontWeight: '600' },

  sectionTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 14,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    width: (SCREEN_W - 32 - 12) / 2, // 32 = 16*2 padding, 12 = gap
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#222',
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: '#888', fontSize: 12, fontWeight: '500' },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    color: '#CCC',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },

  // Content Nav
  contentNav: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  contentNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  contentNavLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  contentNavIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentNavTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  contentNavSub: { color: '#888', fontSize: 12, marginTop: 2 },

  // Top Tracks
  topSection: { paddingHorizontal: 20 },
  topTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  topTrackRank: { color: '#555', fontSize: 14, fontWeight: '700', width: 24 },
  topTrackCover: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  topTrackInfo: { flex: 1 },
  topTrackTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  topTrackPlays: { color: '#888', fontSize: 12, marginTop: 2 },
  topTrackPrice: { color: '#FF5A00', fontSize: 13, fontWeight: '600' },

  // Payout Banner
  payoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    backgroundColor: '#10B98115',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10B98133',
  },
  payoutInfo: { flex: 1, marginLeft: 14 },
  payoutTitle: { color: '#10B981', fontSize: 13, fontWeight: '600' },
  payoutAmount: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 2 },
});

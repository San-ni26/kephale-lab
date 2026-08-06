import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { videosAPI } from '../../src/lib/api';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';
import type { Video } from '@kephale/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10B981',
  PROCESSING: '#F59E0B',
  INACTIVE: '#EF4444',
};

export default function MyVideosScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'CLIP' | 'SHORT'>('ALL');

  const { data: res, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-videos', filter],
    queryFn: () => videosAPI.mine({ type: filter === 'ALL' ? undefined : filter }),
  });

  const videos: Video[] = res?.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
      Alert.alert('Succès', 'La vidéo a été supprimée.');
    },
    onError: () => {
      Alert.alert('Erreur', 'Impossible de supprimer la vidéo.');
    },
  });

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Supprimer la vidéo',
      `Voulez-vous retirer "${title}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const renderItem = ({ item }: { item: Video }) => (
    <View style={styles.videoCard}>
      <VideoThumbnail
        sourceUrl={item.thumbnailUrl}
        videoUrl={item.videoUrl}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.videoInfo}>
        <View style={styles.typeBadge}>
          <Ionicons
            name={item.type === 'CLIP' ? 'videocam-outline' : 'play-circle-outline'}
            size={12}
            color={item.type === 'CLIP' ? '#8B5CF6' : '#06B6D4'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.typeText, { color: item.type === 'CLIP' ? '#8B5CF6' : '#06B6D4' }]}>
            {item.type === 'CLIP' ? 'Clip' : 'Reel'}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
          <Text style={styles.viewsText}>{item.views.toLocaleString()} vues</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="heart" size={11} color="#FF3B30" />
            <Text style={styles.likesText}>{item._count?.likes ?? 0}</Text>
          </View>
        </View>
        {item.price > 0 && (
          <Text style={styles.priceText}>{item.price.toLocaleString()} XOF</Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push(`/artist-dashboard/edit-video/${item.id}`)}
        >
          <Ionicons name="pencil" size={20} color="#06B6D4" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDelete(item.id, item.title)}
        >
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Vidéos</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/artist-dashboard/upload-video')}
        >
          <Ionicons name="add" size={24} color="#06B6D4" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'CLIP', 'SHORT'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'ALL' ? 'Tout' : f === 'CLIP' ? 'Clips' : 'Reels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#06B6D4" />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="film-outline" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Aucune vidéo</Text>
          <Text style={styles.emptyText}>Publiez un clip ou un reel</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: '#06B6D4' }]}
            onPress={() => router.push('/artist-dashboard/upload-video')}
          >
            <Text style={styles.ctaText}>Publier une vidéo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#06B6D4" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
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
  addBtn: { width: 36, alignItems: 'flex-end' },

  filterRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 4,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterBtnActive: { backgroundColor: '#06B6D4' },
  filterText: { color: '#888', fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: '#FFF' },

  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  thumbnail: { width: 100, height: 70 },
  videoInfo: { flex: 1, padding: 12 },
  typeBadge: { marginBottom: 4 },
  typeText: { fontSize: 11, fontWeight: '700' },
  title: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  viewsText: { color: '#888', fontSize: 12 },
  likesText: { color: '#888', fontSize: 12 },
  priceText: { color: '#FF5A00', fontSize: 12, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  actionBtn: { padding: 10 },

  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, marginBottom: 24 },
  cta: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

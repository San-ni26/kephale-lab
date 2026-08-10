import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, ActivityIndicator, RefreshControl,
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

export default function MyReelsScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-reels'],
    queryFn: () => videosAPI.mine({
      limit: 100,
      type: 'SHORT',
    }),
  });

  const videos: Video[] = data?.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-reels'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
      Alert.alert('Succès', 'Le Reel a été supprimé.');
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de supprimer le Reel.');
    },
  });

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Supprimer le Reel',
      `Voulez-vous retirer définitivement "${title}" ?`,
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
          <Ionicons name="play-circle-outline" size={12} color="#FF5A00" style={{ marginRight: 4 }} />
          <Text style={[styles.typeText, { color: '#FF5A00' }]}>
            Reel
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
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push(`/profile/edit-reel/${item.id}`)}
        >
          <Ionicons name="pencil" size={20} color="#FF5A00" />
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
        <Text style={styles.headerTitle}>Mes Reels</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/studio/create-reel' as any)}
        >
          <Ionicons name="add" size={24} color="#FF5A00" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="videocam-outline" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Aucun Reel</Text>
          <Text style={styles.emptyText}>Publiez votre premier Reel pour la communauté !</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: '#FF5A00' }]}
            onPress={() => router.push('/studio/create-reel' as any)}
          >
            <Text style={styles.ctaText}>Publier un Reel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FF5A00" />
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
  actions: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  actionBtn: { padding: 10 },

  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, marginBottom: 24, textAlign: 'center' },
  cta: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

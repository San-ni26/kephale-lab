import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { albumsAPI, artistsAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import type { Album } from '@kephale/types';

export default function MyAlbumsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Get the artist profile to find artist id
  const { data: artistData } = useQuery({
    queryKey: ['artist-profile-me'],
    queryFn: () => artistsAPI.getDashboard(),
    enabled: user?.role === 'ARTIST',
  });
  const artistId = artistData?.data?.data?.artist?.id;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-albums'],
    queryFn: () => albumsAPI.mine({ limit: 100 }),
  });

  const albums: Album[] = data?.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => albumsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-albums'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
    },
  });

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Supprimer l\'album',
      `Supprimer "${title}" ? Les morceaux de cet album ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(id),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Album }) => (
    <TouchableOpacity
      style={styles.albumCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/artist-dashboard/album/${item.id}`)}
    >
      <Image
        source={{ uri: item.coverUrl || 'https://via.placeholder.com/80' }}
        style={styles.cover}
      />
      <View style={styles.albumInfo}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        {item.description && (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {item._count?.tracks ?? 0} titre{(item._count?.tracks ?? 0) !== 1 ? 's' : ''}
          </Text>
          {item.releaseDate && (
            <Text style={styles.metaText}>
              {new Date(item.releaseDate).getFullYear()}
            </Text>
          )}
          {item.price > 0 ? (
            <Text style={styles.priceText}>{item.price.toLocaleString()} XOF</Text>
          ) : (
            <Text style={styles.freeText}>Gratuit</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id, item.title)}
      >
        <Ionicons name="trash-outline" size={18} color="#EF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Albums</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/artist-dashboard/create-album')}
        >
          <Ionicons name="add" size={24} color="#8B5CF6" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : albums.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Aucun album</Text>
          <Text style={styles.emptyText}>Créez votre premier album pour regrouper vos titres</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: '#8B5CF6' }]}
            onPress={() => router.push('/artist-dashboard/create-album')}
          >
            <Text style={styles.ctaText}>Créer un album</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#8B5CF6" />
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

  albumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  cover: { width: 70, height: 70, borderRadius: 10, marginRight: 14 },
  albumInfo: { flex: 1 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { color: '#888', fontSize: 12, marginBottom: 8, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaText: { color: '#666', fontSize: 12 },
  priceText: { color: '#FF5A00', fontSize: 12, fontWeight: '700' },
  freeText: { color: '#10B981', fontSize: 12, fontWeight: '700' },

  deleteBtn: { padding: 8 },

  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  cta: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

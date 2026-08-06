import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { tracksAPI } from '../../src/lib/api';
import type { Track } from '@kephale/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10B981',
  PROCESSING: '#F59E0B',
  INACTIVE: '#EF4444',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif',
  PROCESSING: 'En cours...',
  INACTIVE: 'Inactif',
};

export default function MyTracksScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-tracks'],
    queryFn: () => tracksAPI.mine({ limit: 100 }),
  });

  const tracks: Track[] = data?.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tracksAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
    },
  });

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Supprimer le morceau',
      `Voulez-vous retirer "${title}" de votre catalogue ?`,
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

  const renderItem = ({ item }: { item: Track }) => (
    <View style={styles.trackCard}>
      <Image
        source={{ uri: item.coverUrl || 'https://via.placeholder.com/60' }}
        style={styles.cover}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        {item.album && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="disc-outline" size={12} color="#888" />
            <Text style={styles.albumName} numberOfLines={1}>{item.album.title}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR[item.status]}22` }]}>
            <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="heart" size={11} color="#FF3B30" />
            <Text style={styles.playsText}>{item._count?.likes ?? 0}  •  {item.plays.toLocaleString()} écoutes</Text>
          </View>
        </View>
        {item.price > 0 && (
          <Text style={styles.priceText}>{item.price.toLocaleString()} XOF</Text>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push(`/artist-dashboard/edit-track/${item.id}`)}
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
        <Text style={styles.headerTitle}>Mes Morceaux</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/artist-dashboard/upload-track')}
        >
          <Ionicons name="add" size={24} color="#FF5A00" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="musical-notes-outline" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Aucun morceau</Text>
          <Text style={styles.emptyText}>Uploadez votre premier titre</Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.push('/artist-dashboard/upload-track')}
          >
            <Text style={styles.ctaText}>Uploader un titre</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FF5A00" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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

  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 12,
  },
  cover: { width: 60, height: 60, borderRadius: 10, marginRight: 12 },
  trackInfo: { flex: 1 },
  title: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  albumName: { color: '#8B5CF6', fontSize: 12, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  playsText: { color: '#888', fontSize: 12 },
  priceText: { color: '#FF5A00', fontSize: 12, fontWeight: '700' },

  actions: { paddingLeft: 8, flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6 },

  separator: { height: 10 },

  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, marginBottom: 24 },
  cta: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

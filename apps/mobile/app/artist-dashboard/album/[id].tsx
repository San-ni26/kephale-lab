import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, Alert, Modal, ScrollView
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { albumsAPI, artistsAPI, tracksAPI } from '../../../src/lib/api';
import { useAuthStore } from '../../../src/stores';
import type { Track, Album } from '@kephale/types';

export default function ArtistAlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isAddModalVisible, setAddModalVisible] = useState(false);

  // Get Album Details
  const { data: albumData, isLoading: isLoadingAlbum } = useQuery({
    queryKey: ['album', id],
    queryFn: () => albumsAPI.getById(id as string),
    enabled: !!id,
  });
  
  const album = albumData?.data?.data;
  const albumTracks: Track[] = album?.tracks || [];

  // Get Artist Tracks to add to album
  const { data: myTracksData, isLoading: isLoadingMyTracks } = useQuery({
    queryKey: ['my-tracks'],
    queryFn: () => tracksAPI.mine({ limit: 100 }),
    enabled: isAddModalVisible,
  });

  const availableTracks: Track[] = myTracksData?.data?.data || [];
  // Filter out tracks that are already in the album
  const tracksToAdd = availableTracks.filter(t => t.albumId !== id);

  // Mutations
  const addTrackMutation = useMutation({
    mutationFn: (trackId: string) => albumsAPI.addTrack(id as string, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album', id] });
      queryClient.invalidateQueries({ queryKey: ['my-albums'] });
      setAddModalVisible(false);
    },
    onError: () => Alert.alert('Erreur', 'Impossible d\'ajouter le morceau.')
  });

  const removeTrackMutation = useMutation({
    mutationFn: (trackId: string) => albumsAPI.removeTrack(id as string, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album', id] });
      queryClient.invalidateQueries({ queryKey: ['my-albums'] });
    },
  });

  const handleRemoveTrack = (trackId: string, trackTitle: string) => {
    Alert.alert(
      'Retirer de l\'album',
      `Voulez-vous retirer "${trackTitle}" de cet album ? (Le morceau ne sera pas supprimé).`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => removeTrackMutation.mutate(trackId) },
      ]
    );
  };

  if (isLoadingAlbum) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!album) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#FFF' }}>Album introuvable</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gérer l'album</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.albumInfoContainer}>
        <Image source={{ uri: album.coverUrl || 'https://via.placeholder.com/150' }} style={styles.albumCover} />
        <View style={styles.albumTextInfo}>
          <Text style={styles.albumTitle}>{album.title}</Text>
          <Text style={styles.albumStats}>{albumTracks.length} titres • {album.price > 0 ? `${album.price} XOF` : 'Gratuit'}</Text>
        </View>
      </View>

      <View style={styles.tracksHeaderRow}>
        <Text style={styles.sectionTitle}>Morceaux</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push(`/artist-dashboard/upload-track?albumId=${id}`)}>
            <Ionicons name="cloud-upload-outline" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>Uploader</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>Existant</Text>
          </TouchableOpacity>
        </View>
      </View>

      {albumTracks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={48} color="#333" />
          <Text style={styles.emptyText}>Aucun morceau dans cet album.</Text>
        </View>
      ) : (
        <FlatList
          data={albumTracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.trackRow}>
              <Image source={{ uri: item.coverUrl || album.coverUrl }} style={styles.trackCover} />
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.trackDuration}>
                  {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveTrack(item.id, item.title)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      {/* MODAL: ADD TRACK */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un morceau</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ flex: 1, padding: 16 }}>
              {tracksToAdd.length === 0 ? (
                <Text style={styles.emptyText}>Aucun morceau disponible à ajouter.</Text>
              ) : (
                tracksToAdd.map(track => (
                  <TouchableOpacity 
                    key={track.id} 
                    style={styles.trackRow}
                    onPress={() => addTrackMutation.mutate(track.id)}
                    disabled={addTrackMutation.isPending}
                  >
                    <Image source={{ uri: track.coverUrl || 'https://via.placeholder.com/50' }} style={styles.trackCover} />
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle}>{track.title}</Text>
                      {track.albumId && <Text style={styles.trackDuration}>Actuellement dans un autre album</Text>}
                    </View>
                    {addTrackMutation.isPending && addTrackMutation.variables === track.id ? (
                      <ActivityIndicator color="#8B5CF6" />
                    ) : (
                      <Ionicons name="add-circle-outline" size={24} color="#8B5CF6" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
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
  
  albumInfoContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  albumCover: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#1A1A1A' },
  albumTextInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  albumTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  albumStats: { color: '#888', fontSize: 14 },

  tracksHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginLeft: 4 },

  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#888', fontSize: 14, marginTop: 12, textAlign: 'center' },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  trackCover: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#1A1A1A' },
  trackInfo: { flex: 1, marginLeft: 12 },
  trackTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  trackDuration: { color: '#888', fontSize: 12, marginTop: 4 },
  removeBtn: { padding: 8 },

  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});

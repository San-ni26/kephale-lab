import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { playlistsAPI } from '../../src/lib/api';
import { usePlayerStore } from '../../src/stores';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { setTrack, currentTrack } = usePlayerStore();

  const { data: playlist, isLoading, isError } = useQuery({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const res = await playlistsAPI.getById(id as string);
      return res.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => playlistsAPI.delete(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      router.back();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => playlistsAPI.update(id as string, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });

  const removeTrackMutation = useMutation({
    mutationFn: (trackId: string) => playlistsAPI.removeTrack(id as string, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
    },
  });

  const handleRename = () => {
    Alert.prompt('Renommer', 'Nouveau nom de la playlist', (text) => {
      if (text && text !== playlist?.title) {
        renameMutation.mutate(text);
      }
    }, 'plain-text', playlist?.title);
  };

  const handleDelete = () => {
    Alert.alert('Supprimer', 'Voulez-vous vraiment supprimer cette playlist ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate() }
    ]);
  };

  const playAll = () => {
    if (!playlist || playlist.items.length === 0) return;
    const tracks = playlist.items.map((item: any) => item.track);
    setTrack(tracks[0], tracks);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5A00" />
      </View>
    );
  }

  if (isError || !playlist) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: '#FF0000', fontSize: 16 }}>Erreur lors du chargement de la playlist.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#FFFFFF' }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a1a1a', '#000000']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => {
          Alert.alert('Options', 'Que voulez-vous faire ?', [
            { text: 'Renommer', onPress: handleRename },
            { text: 'Supprimer', style: 'destructive', onPress: handleDelete },
            { text: 'Annuler', style: 'cancel' }
          ]);
        }}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.infoContainer}>
          <View style={styles.coverContainer}>
            <Feather name="list" size={64} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{playlist.title}</Text>
          <Text style={styles.subtitle}>{playlist.items.length} morceaux</Text>

          {playlist.items.length > 0 && (
            <TouchableOpacity style={styles.playButton} onPress={playAll}>
              <Ionicons name="play" size={24} color="#000000" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.trackList}>
          {playlist.items.length === 0 ? (
            <Text style={styles.emptyText}>Aucun morceau dans cette playlist.</Text>
          ) : (
            playlist.items.map((item: any) => {
              const track = item.track;
              const isPlaying = currentTrack?.id === track.id;

              return (
                <View key={item.id} style={styles.trackRow}>
                  <TouchableOpacity
                    style={styles.trackTouchable}
                    onPress={() => {
                      const allTracks = playlist.items.map((i: any) => i.track);
                      setTrack(track, allTracks);
                    }}
                  >
                    <View style={styles.trackInfo}>
                      <Text style={[styles.trackTitle, isPlaying && { color: '#FF5A00' }]} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>
                        {track.artist?.stageName || 'Artiste Inconnu'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => {
                      Alert.alert('Retirer', 'Retirer ce morceau de la playlist ?', [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Retirer', style: 'destructive', onPress: () => removeTrackMutation.mutate(track.id) }
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#A0A0A0" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50, // Safe area approx
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  coverContainer: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
    marginBottom: 24,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackList: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Space for mini player
  },
  emptyText: {
    color: '#A0A0A0',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  trackTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackInfo: {
    flex: 1,
    paddingRight: 16,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  trackArtist: {
    color: '#A0A0A0',
    fontSize: 14,
  },
  removeButton: {
    padding: 8,
  }
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayerStore } from '../../src/stores/index';
import { tracksAPI, playlistsAPI } from '../../src/lib/api';
import TextInputModal from '../../src/components/TextInputModal';

const { width } = Dimensions.get('window');

export default function TrackPlayerScreen() {
  const { id } = useLocalSearchParams();
  const { currentTrack, setTrack, isPlaying, setPlaying, nextTrack, prevTrack, progress, duration } = usePlayerStore();
  const [loading, setLoading] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);

  // If we open a track directly from a link or home page, we might need to load it
  useEffect(() => {
    if (id && (!currentTrack || currentTrack.id !== id)) {
      loadTrack(id as string);
    }
  }, [id]);

  const loadTrack = async (trackId: string) => {
    try {
      setLoading(true);
      const res = await tracksAPI.getById(trackId);
      if (res.data?.data) {
        setTrack(res.data.data, [res.data.data]); // Simple queue for now
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const track = currentTrack;

  if (loading || !track) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Calculate progress width
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <LinearGradient colors={['#1A1A1A', '#000000']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-down" size={32} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerSubtitle}>EN LECTURE DEPUIS</Text>
          <Text style={styles.headerTitle}>{track.album?.title || 'Single'}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Album Cover */}
      <View style={styles.coverContainer}>
        <Image 
          source={{ uri: track.coverUrl }} 
          style={styles.coverImage} 
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
        />
      </View>

      {/* Track Info */}
      <View style={styles.infoContainer}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{track.artist?.stageName || 'Artiste Inconnu'}</Text>
          </View>
          <TouchableOpacity>
            <Ionicons name="heart-outline" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          <View style={[styles.progressKnob, { left: `${progressPercent}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{Math.floor(progress / 60)}:{(Math.floor(progress) % 60).toString().padStart(2, '0')}</Text>
          <Text style={styles.timeText}>-{Math.floor((duration - progress) / 60)}:{(Math.floor(duration - progress) % 60).toString().padStart(2, '0')}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity>
          <Ionicons name="shuffle" size={28} color="#A0A0A0" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={prevTrack}>
          <Ionicons name="play-skip-back" size={40} color="#FFFFFF" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.playButton} 
          onPress={() => setPlaying(!isPlaying)}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={40} color="#000000" style={{ marginLeft: isPlaying ? 0 : 4 }} />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={nextTrack}>
          <Ionicons name="play-skip-forward" size={40} color="#FFFFFF" />
        </TouchableOpacity>
        
        <TouchableOpacity>
          <Ionicons name="repeat" size={28} color="#A0A0A0" />
        </TouchableOpacity>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity>
          <Ionicons name="tv-outline" size={24} color="#A0A0A0" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowCreatePlaylist(true)}>
          <Ionicons name="add-circle-outline" size={26} color="#A0A0A0" />
        </TouchableOpacity>
        <TouchableOpacity onPress={async () => {
          try {
            const res = await playlistsAPI.list();
            const playlists = res.data.data;
            if (playlists.length === 0) {
              Alert.alert('Info', 'Créez d\'abord une playlist avec le bouton +');
              return;
            }
            // Add to first playlist for now
            const firstPlaylist = playlists[0];
            await playlistsAPI.addTrack(firstPlaylist.id, track.id);
            Alert.alert('Succès', `Ajouté à ${firstPlaylist.title} !`);
          } catch (e) {
            Alert.alert('Erreur', 'Impossible d\'ajouter à la playlist');
          }
        }}>
          <Ionicons name="list" size={24} color="#A0A0A0" />
        </TouchableOpacity>
      </View>

      <TextInputModal
        visible={showCreatePlaylist}
        title="Nouvelle Playlist"
        placeholder="Nom de la playlist"
        confirmText="Créer"
        onConfirm={async (text) => {
          try {
            await playlistsAPI.create(text);
            Alert.alert('Succès', 'Playlist créée !');
            setShowCreatePlaylist(false);
          } catch (e) {
            Alert.alert('Erreur', 'Impossible de créer la playlist');
          }
        }}
        onCancel={() => setShowCreatePlaylist(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FF5A00',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50, // Safe area approx
    paddingHorizontal: 20,
  },
  headerButton: {
    width: 40,
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerSubtitle: {
    color: '#A0A0A0',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  coverContainer: {
    alignItems: 'center',
    marginTop: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  coverImage: {
    width: width - 60,
    height: width - 60,
    borderRadius: 12,
    backgroundColor: '#333',
  },
  infoContainer: {
    paddingHorizontal: 30,
    marginTop: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  trackArtist: {
    color: '#A0A0A0',
    fontSize: 16,
    marginTop: 4,
  },
  progressContainer: {
    paddingHorizontal: 30,
    marginTop: 30,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF5A00',
    borderRadius: 2,
  },
  progressKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF5A00',
    position: 'absolute',
    marginLeft: -6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    marginTop: 20,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    marginTop: 40,
  }
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePlayerStore } from '../stores/index';

export default function MiniPlayer({ tabBarHeight = 85 }: { tabBarHeight?: number }) {
  const { currentTrack, isVisible, isPlaying, setPlaying, nextTrack, progress, duration, clearPlayer } = usePlayerStore();

  if (!isVisible || !currentTrack) return null;

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <TouchableOpacity
      style={[styles.container, { bottom: tabBarHeight }]}
      activeOpacity={0.9}
      onPress={() => router.push(`/track/${currentTrack.id}`)}
    >
      <Image 
        source={{ uri: currentTrack.coverUrl }} 
        style={styles.cover} 
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={150}
      />
      
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{currentTrack.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist?.stageName || 'Artiste Inconnu'}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.button} onPress={() => setPlaying(!isPlaying)}>
          <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={nextTrack}>
          <Ionicons name="play-skip-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonClose} onPress={clearPlayer}>
          <Ionicons name="close" size={24} color="#A0A0A0" />
        </TouchableOpacity>
      </View>
      
      {/* ProgressBar Simulation */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#1E1E1E', // Slightly lighter than pure black for contrast
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    color: '#A0A0A0',
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  buttonClose: {
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 8,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: '#333',
    borderRadius: 1,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FF5A00',
    borderRadius: 1,
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { VideoThumbnail } from '../VideoThumbnail';

export default function ClipList({ clips }: { clips: any[] }) {
  return (
    <View style={styles.clipsGrid}>
      {clips.map((clip: any) => (
        <TouchableOpacity
          key={clip.id}
          style={styles.clipCard}
          onPress={() => router.push(`/clip/${clip.id}`)}
        >
          <View style={styles.clipThumbnailContainer}>
            <VideoThumbnail
              sourceUrl={clip.thumbnailUrl}
              videoUrl={clip.videoUrl}
              style={styles.clipThumbnail}
              resizeMode="cover"
            />

            <View style={styles.clipDurationBadge}>
              <Text style={styles.clipDurationText}>
                {Math.floor(clip.duration / 60)}:{String(clip.duration % 60).padStart(2, '0')}
              </Text>
            </View>
            {clip.price > 0 && (
              <View style={styles.clipLockBadge}>
                <Ionicons name="lock-closed" size={14} color="#FFF" />
                <Text style={styles.clipPriceText}>{clip.price} FCFA</Text>
              </View>
            )}
          </View>
          <View style={styles.clipInfo}>
            <Image 
              source={{ uri: clip.artist?.avatar }} 
              style={styles.clipArtistAvatar} 
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
            />
            <View style={styles.clipTextInfo}>
              <Text style={styles.clipTitle} numberOfLines={2}>{clip.title}</Text>
              <Text style={styles.clipSubtitle}>
                {clip.artist?.stageName} • {clip.views} vues • {new Date(clip.createdAt || Date.now()).getFullYear()}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
      {clips.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Aucun clip trouvé.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clipsGrid: { paddingHorizontal: 0, paddingBottom: 20 },
  clipCard: { width: '100%', paddingBottom: 20, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  clipThumbnailContainer: { marginHorizontal: 16, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1A1A1A', marginBottom: 12 },
  clipThumbnail: { width: '100%', height: '100%' },
  clipDurationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  clipDurationText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  clipLockBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255, 90, 0, 0.9)', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  clipPriceText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  clipInfo: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16 },
  clipArtistAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', marginRight: 12 },
  clipTextInfo: { flex: 1 },
  clipTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  clipSubtitle: { color: '#A0A0A0', fontSize: 13 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyStateText: { color: '#A0A0A0', textAlign: 'center', fontSize: 16 },
});

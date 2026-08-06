import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function LiveFeedList({ lives }: { lives: any[] }) {
  return (
    <View style={styles.livesGrid}>
      {lives.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="radio-outline" size={48} color="#555" />
          <Text style={styles.emptyStateText}>Aucun live en cours pour le moment.</Text>
        </View>
      ) : (
        lives.map((live: any) => (
          <TouchableOpacity
            key={live.id}
            style={styles.liveFeedCard}
            onPress={() => router.push(`/live/${live.id}`)}
          >
            <View style={styles.liveThumbnailContainer}>
              <Image 
                source={{ uri: live.artist?.coverImage }} 
                style={styles.liveThumbnail} 
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
              <View style={styles.liveBadgeTop}>
                <Text style={styles.liveBadgeTextTop}>{live.status === 'LIVE' ? 'EN DIRECT' : 'PROGRAMMÉ'}</Text>
              </View>
              {live.status === 'LIVE' && (
                <View style={styles.viewersBadge}>
                  <Ionicons name="eye" size={14} color="#FFF" />
                  <Text style={styles.viewersText}>{live.viewerCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.clipInfo}>
              <Image 
                source={{ uri: live.artist?.avatar }} 
                style={styles.clipArtistAvatar} 
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
              <View style={styles.clipTextInfo}>
                <Text style={styles.clipTitle} numberOfLines={1}>{live.title}</Text>
                <Text style={styles.clipSubtitle}>
                  {live.artist?.stageName} • {live.mode === 'AUDIO' ? 'Live Audio' : 'Live Vidéo'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  livesGrid: { paddingHorizontal: 0, paddingBottom: 20 },
  liveFeedCard: { width: '100%', paddingBottom: 20, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  liveThumbnailContainer: { marginHorizontal: 16, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1A1A1A', marginBottom: 12 },
  liveThumbnail: { width: '100%', height: '100%' },
  liveBadgeTop: { position: 'absolute', top: 8, left: 8, backgroundColor: '#FF5A00', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  liveBadgeTextTop: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  viewersBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewersText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  clipInfo: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16 },
  clipArtistAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', marginRight: 12 },
  clipTextInfo: { flex: 1 },
  clipTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  clipSubtitle: { color: '#A0A0A0', fontSize: 13 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyStateText: { color: '#A0A0A0', textAlign: 'center', fontSize: 16 },
});

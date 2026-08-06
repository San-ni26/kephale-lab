import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

export default function AlbumSection({ albums }: { albums: any[] }) {
  if (!albums || albums.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Albums Populaires</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {albums.map((album: any) => (
          <TouchableOpacity key={album.id} style={styles.albumCard} onPress={() => router.push(`/album/${album.id}`)}>
            <Image 
              source={{ uri: album.coverUrl }} 
              style={styles.albumCover} 
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
            />
            <Text style={styles.albumTitle} numberOfLines={1}>{album.title}</Text>
            <Text style={styles.albumArtist} numberOfLines={1}>{album.artist?.stageName}</Text>
            {album.price > 0 && (
              <Text style={{ color: '#FF5A00', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
                {album._count?.purchases || 0} vente{album._count?.purchases > 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, color: '#FFFFFF', fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  scrollContent: { paddingHorizontal: 20 },
  albumCard: { width: 140, marginRight: 16 },
  albumCover: { width: 140, height: 140, borderRadius: 12, backgroundColor: '#1A1A1A', marginBottom: 8 },
  albumTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  albumArtist: { color: '#A0A0A0', fontSize: 11, marginTop: 2 },
});

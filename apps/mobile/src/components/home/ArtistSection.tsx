import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

export default function ArtistSection({ artists }: { artists: any[] }) {
  if (!artists || artists.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Artistes à la une</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {artists.map((artist: any) => (
          <TouchableOpacity key={artist.id} style={styles.artistCard} onPress={() => router.push(`/artist/${artist.id}`)}>
            <Image 
              source={{ uri: artist.avatar }} 
              style={styles.artistAvatar} 
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
            />
            <Text style={styles.artistName} numberOfLines={1}>{artist.stageName}</Text>
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
  artistCard: { alignItems: 'center', marginRight: 16, width: 80 },
  artistAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', marginBottom: 8 },
  artistName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});

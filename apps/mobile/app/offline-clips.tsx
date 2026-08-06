import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOfflineStore } from '../src/stores';
import { router } from 'expo-router';
import { VideoThumbnail } from '../src/components/VideoThumbnail';

export default function OfflineClipsScreen() {
  const { downloads, removeDownload } = useOfflineStore();

  const offlineClips = useMemo(() => {
    return Object.values(downloads).filter((item: any) => item.type === 'CLIP' || item.type === 'VIDEO');
  }, [downloads]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Image source={require('../assets/library_bg.png')} style={styles.backgroundImage} />
      <LinearGradient colors={['rgba(0,0,0,0.8)', '#000000']} style={styles.backgroundOverlay} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clips Hors Ligne</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
        {offlineClips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="video-off" size={48} color="#444" />
            <Text style={styles.emptyText}>Aucun clip vidéo téléchargé.</Text>
          </View>
        ) : (
          offlineClips.map((item: any) => {
            const sizeMb = item.sizeBytes ? (item.sizeBytes / (1024 * 1024)).toFixed(1) : '0';
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.cardRow}
                onPress={() => router.push(`/clip/${item.id}`)}
              >
                <VideoThumbnail
                  sourceUrl={item.localCoverUri}
                  videoUrl={item.localFileUri}
                  style={styles.videoThumbPlaceholder}
                  fallbackIcon="video"
                />
                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">{item.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">{item.artistName} • {sizeMb} MB</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity style={styles.iconCircleBtn} onPress={() => router.push(`/clip/${item.id}`)}>
                    <Feather name="play" size={14} color="#FF5A00" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert(
                      'Supprimer le clip',
                      `Supprimer "${item.title}" des fichiers hors ligne ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) }
                      ]
                    );
                  }}>
                    <Feather name="trash-2" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  backgroundOverlay: { position: 'absolute', width: '100%', height: '100%' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, color: '#FFFFFF', fontWeight: 'bold' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 120 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  videoThumbPlaceholder: {
    width: 64,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: { flex: 1, marginLeft: 14, marginRight: 8 },
  trackTitle: { color: '#FFFFFF', fontWeight: '600', fontSize: 15, marginBottom: 2 },
  trackArtist: { color: '#A0A0A0', fontSize: 13 },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 90, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
});

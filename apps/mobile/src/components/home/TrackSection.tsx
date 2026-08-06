import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineStore } from '../../stores';

type TrackSectionProps = {
  tracks: any[];
  purchases: any[];
  onPlayTrack: (track: any) => void;
};

export default function TrackSection({ tracks, purchases, onPlayTrack }: TrackSectionProps) {
  const { downloads, downloading, downloadTrack, removeDownload } = useOfflineStore();
  if (!tracks || tracks.length === 0) return null;

  const isTrackPurchased = (trackId: string) => {
    return purchases.some((p: any) => p.trackId === trackId);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Nouveautés</Text>
      </View>
      {tracks.map((track: any) => (
        <TouchableOpacity
          key={track.id}
          style={styles.trackRow}
          onPress={() => onPlayTrack(track)}
        >
          <Image 
            source={{ uri: track.coverUrl }} 
            style={styles.trackCover} 
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
          />
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.trackArtist}>{track.artist?.stageName}</Text>
          </View>
          {/* Download offline action */}
          {(track.price === 0 || isTrackPurchased(track.id)) && (
            <View style={{ marginRight: 16 }}>
              {downloads[track.id] ? (
                <TouchableOpacity onPress={() => {
                  Alert.alert(
                    'Supprimer',
                    `Supprimer "${track.title}" des fichiers hors ligne ?`,
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(track.id) }
                    ]
                  );
                }}>
                  <Ionicons name="cloud-done" size={18} color="#10B981" />
                </TouchableOpacity>
              ) : downloading[track.id] !== undefined ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ActivityIndicator size="small" color="#FF5A00" />
                  <Text style={{ color: '#FF5A00', fontSize: 10 }}>{downloading[track.id]}%</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={() => downloadTrack(track)}>
                  <Ionicons name="cloud-download-outline" size={18} color="#A0A0A0" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {track.price > 0 ? (
            isTrackPurchased(track.id) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>Acheté</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.trackPrice}>{track.price} XOF</Text>
                <Text style={{ color: '#A0A0A0', fontSize: 11, marginTop: 2 }}>{track._count?.purchases || 0} vente{track._count?.purchases > 1 ? 's' : ''}</Text>
              </View>
            )
          ) : (
            <Text style={styles.trackFree}>Gratuit</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  trackCover: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#1A1A1A' },
  trackInfo: { flex: 1, marginLeft: 12 },
  trackTitle: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  trackArtist: { color: '#A0A0A0', fontSize: 13, marginTop: 3 },
  trackPrice: { color: '#FF5A00', fontWeight: '700', fontSize: 14 },
  trackFree: { color: '#FFFFFF', fontWeight: '600', fontSize: 12 },
});

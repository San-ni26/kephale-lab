import React, { useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, FlatList, Dimensions, Pressable, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOfflineStore } from '../src/stores';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoThumbnail } from '../src/components/VideoThumbnail';

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

function OfflineReelPlayer({ item, isActive, containerHeight, onClose }: { item: any; isActive: boolean; containerHeight: number; onClose: () => void }) {
  const [isPlaying, setIsPlaying] = useState(true);

  const player = useVideoPlayer(item.localFileUri, (p) => {
    p.loop = true;
    p.play();
  });

  React.useEffect(() => {
    if (isActive) {
      setIsPlaying(true);
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  return (
    <View style={[styles.reelContainer, { height: containerHeight }]}>
      <Pressable 
        style={[styles.video, { height: containerHeight }]} 
        onPress={() => {
          const next = !isPlaying;
          setIsPlaying(next);
          if (next) player.play();
          else player.pause();
        }}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
        />
        {!isPlaying && (
          <View style={styles.playIconOverlay}>
            <Feather name="play" size={64} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </Pressable>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.reelBottomGradient} />
      
      <View style={styles.reelInfo}>
        <Text style={styles.reelTitle}>{item.title}</Text>
        <Text style={styles.reelArtist}>@{item.artistName} • Hors Ligne</Text>
      </View>

      <SafeAreaView edges={['top']} style={styles.reelTopNav}>
        <TouchableOpacity onPress={onClose} style={styles.closeReelBtn}>
          <Feather name="arrow-left" size={32} color="#FFF" />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

export default function OfflineReelsScreen() {
  const { downloads, removeDownload } = useOfflineStore();
  const insets = useSafeAreaInsets();
  
  // Dans le store, ils sont soit 'SHORT', soit 'VIDEO' (pour compatibilité)
  const offlineReels = useMemo(() => {
    return Object.values(downloads).filter((item: any) => item.type === 'SHORT');
  }, [downloads]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const containerHeight = windowHeight;

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Image source={require('../assets/library_bg.png')} style={styles.backgroundImage} />
      <LinearGradient colors={['rgba(0,0,0,0.8)', '#000000']} style={styles.backgroundOverlay} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reels Hors Ligne</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
        {offlineReels.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="smartphone" size={48} color="#444" />
            <Text style={styles.emptyText}>Aucun reel téléchargé.</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {offlineReels.map((item: any, index: number) => {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.gridItem}
                  onPress={() => {
                    setCurrentIndex(index);
                    setSelectedIndex(index);
                  }}
                >
                  <VideoThumbnail
                    sourceUrl={item.localCoverUri}
                    videoUrl={item.localFileUri}
                    style={styles.gridImage}
                    fallbackIcon="video"
                  />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.gridOverlay}>
                    <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
                    <Feather name="play" size={14} color="#FFF" />
                  </LinearGradient>

                  <TouchableOpacity style={styles.gridDeleteBtn} onPress={() => {
                    Alert.alert(
                      'Supprimer',
                      `Supprimer "${item.title}" ?`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) }
                      ]
                    );
                  }}>
                    <Feather name="trash-2" size={16} color="#FFF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={selectedIndex !== null} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <FlatList
            data={offlineReels}
            keyExtractor={(item: any) => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            initialScrollIndex={selectedIndex || 0}
            getItemLayout={(data, index) => ({ length: containerHeight, offset: containerHeight * index, index })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item, index }) => (
              <OfflineReelPlayer 
                item={item} 
                isActive={index === currentIndex} 
                containerHeight={containerHeight}
                onClose={() => setSelectedIndex(null)}
              />
            )}
          />
        </View>
      </Modal>
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
  listContainer: { paddingHorizontal: 10, paddingBottom: 120 },
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '32%',
    aspectRatio: 9 / 16,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridTitle: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 4,
  },
  gridDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    borderRadius: 12,
  },
  
  // Reel Player Styles
  reelContainer: { width: windowWidth, backgroundColor: '#000' },
  video: { width: '100%', flex: 1 },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  reelInfo: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 70,
  },
  reelTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  reelArtist: { color: '#FFFFFF', fontSize: 15 },
  reelTopNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  closeReelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

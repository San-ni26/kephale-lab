import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, FlatList, Dimensions, TouchableOpacity, Share, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { videosAPI } from '../lib/api';
import { useAuthStore } from '../stores';
import VideoCommentsSheet from './VideoCommentsSheet';
import VideoThumbnail from './VideoThumbnail';
import type { Video } from '@kephale/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function ActiveReelPlayer({ videoUrl, isActive }: { videoUrl: string; isActive: boolean }) {
  const player = useVideoPlayer(videoUrl, (p) => {
    try {
      p.loop = true;
      p.muted = false;
      if (isActive) {
        p.play();
      } else {
        p.pause();
      }
    } catch {}
  });

  useEffect(() => {
    if (isActive) {
      try { player.play(); } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [isActive, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function SimpleReelItem({ 
  item, 
  isActive, 
  isNearActive, 
  onOpenComments 
}: { 
  item: Video & { hasLiked?: boolean; likes?: any[] }; 
  isActive: boolean; 
  isNearActive: boolean; 
  onOpenComments: (id: string) => void 
}) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(item.hasLiked ?? false);
  const likeCount = item._count?.likes ?? 0;

  useEffect(() => {
    if (item.likes && user) {
      setLiked(item.likes.some((l: any) => l.userId === user.id));
    }
  }, [item, user]);

  const likeMutation = useMutation({
    mutationFn: () => videosAPI.like(item.id),
    onMutate: async () => {
      if (!item.artistId) return;
      await queryClient.cancelQueries({ queryKey: ['artist-reels', item.artistId] });
      const previous = queryClient.getQueryData(['artist-reels', item.artistId]);
      
      queryClient.setQueryData(['artist-reels', item.artistId], (old: any) => {
        if (!old?.data?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            data: old.data.data.map((video: any) => {
              if (video.id === item.id) {
                const wasLiked = video.hasLiked;
                return {
                  ...video,
                  hasLiked: !wasLiked,
                  _count: {
                    ...video._count,
                    likes: wasLiked ? Math.max(0, video._count.likes - 1) : video._count.likes + 1
                  }
                };
              }
              return video;
            })
          }
        };
      });

      return { previous };
    },
    onError: (err, variables, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(['artist-reels', item.artistId], context.previous);
      }
    },
  });

  const handleLike = () => {
    if (!user) return Alert.alert('Erreur', 'Connectez-vous pour aimer ce reel.');
    setLiked(prev => !prev);
    likeMutation.mutate();
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `Regarde ce reel : ${item.title} sur Kephale !` });
    } catch (e) {}
  };

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <View style={styles.reelContainer}>
      {/* Mount video player for active and adjacent reels for instant playback */}
      {(isActive || isNearActive) && !!item.videoUrl ? (
        <ActiveReelPlayer videoUrl={item.videoUrl} isActive={isActive} />
      ) : (
        <VideoThumbnail
          sourceUrl={item.thumbnailUrl}
          videoUrl={item.videoUrl}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <View style={styles.gradient} pointerEvents="none" />
      
      {/* Right Action Bar */}
      <View style={styles.actionBar}>
        {/* Like */}
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#EF4444' : '#FFF'} />
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item._count?.comments ?? 0)}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="arrow-redo-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>Partager</Text>
        </TouchableOpacity>
      </View>

      {/* Overlay info */}
      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
        ) : null}
      </View>
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  reels: Video[];
  initialIndex?: number;
}

export default function ArtistReelsModal({ visible, onClose, reels, initialIndex = 0 }: Props) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && reels.length > 0) {
      setActiveIndex(initialIndex);
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({ index: initialIndex, animated: false });
        }
      }, 100);
    }
  }, [visible, initialIndex, reels]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const handleOpenComments = useCallback((id: string) => {
    setSelectedVideoId(id);
    setIsCommentsVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <StatusBar style="light" />
        <FlatList
          ref={flatListRef}
          data={reels}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SimpleReelItem 
              item={item} 
              isActive={index === activeIndex} 
              isNearActive={Math.abs(index - activeIndex) <= 1}
              onOpenComments={handleOpenComments} 
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          disableIntervalMomentum={true}
          bounces={false}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50, minimumViewTime: 50 }}
          getItemLayout={(_, index) => ({
            length: SCREEN_H,
            offset: SCREEN_H * index,
            index,
          })}
        />
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={30} color="#FFF" />
        </TouchableOpacity>
      </View>

      <VideoCommentsSheet
        videoId={selectedVideoId}
        visible={isCommentsVisible}
        onClose={() => setIsCommentsVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  reelContainer: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  overlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 80,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  desc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  gradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.4,
    backgroundColor: 'transparent',
  },
  actionBar: {
    position: 'absolute',
    right: 14,
    bottom: 40,
    alignItems: 'center',
    gap: 20,
    zIndex: 2,
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionCount: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});

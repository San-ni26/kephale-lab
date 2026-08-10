import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Pressable, Platform, useWindowDimensions
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { videosAPI, artistsAPI } from '../../src/lib/api';
import { useAuthStore, usePlayerStore, useOfflineStore } from '../../src/stores';
import VideoCommentsSheet from '../../src/components/VideoCommentsSheet';
import ReelAdCard from '../../src/components/ReelAdCard';
import { useShouldShowAds } from '../../src/lib/ads';
import type { Video } from '@kephale/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';

const ReelVideoPlayer = React.memo(function ReelVideoPlayer({
  item,
  isActive,
  containerHeight,
}: {
  item: Video;
  isActive: boolean;
  containerHeight: number;
}) {
  const { setPlaying: setGlobalIsPlaying, isPlaying: isGlobalPlaying } = usePlayerStore();
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const lastTimeRef = React.useRef(0);

  const player = useVideoPlayer(item.videoUrl, (p) => {
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

  const getSafeTime = React.useCallback(() => {
    try {
      if (player && typeof player.currentTime === 'number') {
        lastTimeRef.current = player.currentTime;
      }
    } catch {}
    return lastTimeRef.current;
  }, [player]);

  // Listener d'état et de progression sur le player vidéo
  React.useEffect(() => {
    let subStatus: any = null;
    let subTime: any = null;
    try {
      if (player && typeof player.addListener === 'function') {
        subStatus = player.addListener('statusChange', (status) => {
          if ((status as any)?.error) {
            setVideoError(true);
          }
        });

        subTime = player.addListener('timeUpdate', (event: any) => {
          if (event && typeof event.currentTime === 'number') {
            lastTimeRef.current = event.currentTime;
          }
        });
      }
    } catch {}

    return () => {
      try { subStatus?.remove?.(); } catch {}
      try { subTime?.remove?.(); } catch {}
    };
  }, [player]);

  const hasSentWatchRef = React.useRef(false);

  // Gérer la visibilité & lecture instantanée
  React.useEffect(() => {
    if (isActive) {
      if (isGlobalPlaying) {
        setGlobalIsPlaying(false);
      }
      setIsPlaying(true);
      hasSentWatchRef.current = false;
      try {
        player.play();
      } catch (e) {}
    } else {
      setIsPlaying(false);
      try {
        player.pause();
      } catch (e) {}
      const time = getSafeTime();
      if (time >= 2 && !hasSentWatchRef.current) {
        hasSentWatchRef.current = true;
        videosAPI.watch(item.id, { watchDurationSec: time, completed: false }).catch(() => {});
      }
    }

    return () => {
      const time = lastTimeRef.current;
      if (time >= 2 && !hasSentWatchRef.current) {
        hasSentWatchRef.current = true;
        videosAPI.watch(item.id, { watchDurationSec: time, completed: false }).catch(() => {});
      }
    };
  }, [isActive, item.id, player, isGlobalPlaying, setGlobalIsPlaying, getSafeTime]);

  return (
    <Pressable 
      style={[styles.video, { height: containerHeight }]} 
      onPress={() => {
        const next = !isPlaying;
        setIsPlaying(next);
        try {
          if (next) player.play();
          else player.pause();
        } catch {}
      }}
    >
      {/* Poster image always present under video to avoid any black frame or background loader */}
      <VideoThumbnail
        sourceUrl={item.thumbnailUrl}
        videoUrl={item.videoUrl}
        style={[StyleSheet.absoluteFill, { width: '100%', height: containerHeight }]}
        resizeMode="cover"
      />

      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { width: '100%', height: containerHeight }]}
        contentFit="cover"
        nativeControls={false}
      />

      {!isPlaying && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseCircle}>
            <Ionicons name="play" size={36} color="#FFFFFF" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}

      {videoError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={36} color="#FF3B30" style={{ marginBottom: 8 }} />
          <Text style={styles.errorText}>Vidéo indisponible</Text>
          <TouchableOpacity
            style={styles.errorRetryBtn}
            onPress={() => {
              setVideoError(false);
              try { player.play(); } catch {}
            }}
          >
            <Text style={styles.errorRetryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}
    </Pressable>
  );
});

const ReelItem = React.memo(function ReelItem({
  item,
  isActive,
  isNearActive,
  containerHeight,
  onOpenComments,
}: {
  item: Video & { hasLiked?: boolean };
  isActive: boolean;
  isNearActive: boolean;
  containerHeight: number;
  onOpenComments: (id: string) => void;
}) {
  const liked = item.hasLiked ?? false;
  const likeCount = item._count?.likes ?? 0;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { downloads, downloading, downloadVideo, removeDownload } = useOfflineStore();

  // ── Optimistic follow state ──────────────────────────────────────────────────
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const likeMutation = useMutation({
    mutationFn: () => videosAPI.like(item.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['reels-feed'] });
      const previous = queryClient.getQueryData(['reels-feed']);
      
      // Optimistic update in cache
      queryClient.setQueryData(['reels-feed'], (old: any) => {
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
                    likes: wasLiked ? Math.max(0, (video._count?.likes ?? 1) - 1) : (video._count?.likes ?? 0) + 1
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
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['reels-feed'], context.previous);
      }
    },
  });

  const handleLike = () => {
    if (!user) { router.push('/(auth)/welcome'); return; }
    likeMutation.mutate();
  };

  const handleFollow = async () => {
    if (!user) { router.push('/(auth)/welcome'); return; }
    if (!item.artist?.id || isFollowLoading) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setIsFollowLoading(true);

    try {
      if (wasFollowing) {
        await artistsAPI.unfollow(item.artist.id);
      } else {
        await artistsAPI.follow(item.artist.id);
      }
    } catch {
      setIsFollowing(wasFollowing);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const isOwner = !!user && ((item as any).userId === user.id || item.artist?.id === user.artistProfile?.id || (user.artistProfile && item.artistId === user.artistProfile.id) || (user as any).role === 'ADMIN');

  const deleteReelMutation = useMutation({
    mutationFn: () => videosAPI.delete(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['my-reels'] });
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });
      Alert.alert('Succès', 'Le Reel a été supprimé.');
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de supprimer le Reel.');
    },
  });

  const handleDeleteReel = () => {
    Alert.alert(
      'Supprimer le Reel',
      `Voulez-vous supprimer définitivement "${item.title}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteReelMutation.mutate() },
      ]
    );
  };

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <View style={[styles.reelContainer, { height: containerHeight }]}>
      <StatusBar style="light" />

      {/* Video active or preloaded adjacent video for instant playback */}
      {(isActive || isNearActive) && !!item.videoUrl ? (
        <ReelVideoPlayer
          item={item}
          isActive={isActive}
          containerHeight={containerHeight}
        />
      ) : (
        <View style={[styles.video, { height: containerHeight, backgroundColor: '#000' }]}>
          <VideoThumbnail
            sourceUrl={item.thumbnailUrl}
            videoUrl={item.videoUrl}
            style={[StyleSheet.absoluteFill, { width: '100%', height: containerHeight }]}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Gradient overlay */}
      <View style={styles.gradient} pointerEvents="none" />

      {/* Right Action Bar */}
      <View style={styles.actionBar}>
        {/* Artist avatar */}
        <TouchableOpacity
          style={styles.artistAvatarWrap}
          onPress={() => item.artist?.id && router.push(`/artist/${item.artist.id}`)}
        >
          {item.artist?.avatar ? (
            <Image 
              source={{ uri: item.artist.avatar }} 
              style={styles.artistAvatar} 
              cachePolicy="memory-disk"
              contentFit="cover"
            />
          ) : (
            <View style={[styles.artistAvatar, styles.artistAvatarFallback]}>
              <Text style={styles.artistAvatarText}>{item.artist?.stageName?.[0] ?? 'A'}</Text>
            </View>
          )}
          <View style={styles.followPlusBadge}>
            <Ionicons name="add" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>

        {/* Like */}
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={30}
            color={liked ? '#EF4444' : '#FFF'}
          />
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item._count?.comments ?? 0)}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="arrow-redo-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>Partager</Text>
        </TouchableOpacity>

        {/* Views */}
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="eye-outline" size={24} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item.views)}</Text>
        </TouchableOpacity>

        {/* Download Clip offline */}
        {downloads[item.id] ? (
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => {
              Alert.alert(
                'Supprimer',
                'Supprimer ce clip des fichiers hors ligne ?',
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) }
                ]
              );
            }}
          >
            <Ionicons name="cloud-done" size={24} color="#10B981" />
            <Text style={[styles.actionCount, { color: '#10B981' }]}>Téléchargé</Text>
          </TouchableOpacity>
        ) : downloading[item.id] !== undefined ? (
          <View style={styles.actionBtn}>
            <ActivityIndicator size="small" color="#FF5A00" />
            <Text style={[styles.actionCount, { color: '#FF5A00' }]}>{downloading[item.id]}%</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionBtn} onPress={() => downloadVideo(item)}>
            <Ionicons name="cloud-download-outline" size={24} color="#FFF" />
            <Text style={styles.actionCount}>Télécharger</Text>
          </TouchableOpacity>
        )}

        {/* Delete option for the owner / creator of the reel */}
        {isOwner && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteReel}>
            <Ionicons name="trash-outline" size={24} color="#EF4444" />
            <Text style={[styles.actionCount, { color: '#EF4444' }]}>Supprimer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Info */}
      <View style={styles.bottomInfo}>
        <View style={styles.artistRow}>
          <TouchableOpacity
            style={styles.artistNameBtn}
            onPress={() => item.artist?.id && router.push(`/artist/${item.artist.id}`)}
          >
            <Text style={styles.artistName}>@{item.artist?.stageName ?? 'artiste'}</Text>
            {item.artist?.isVerified && (
              <View style={styles.verifiedDot}>
                <Ionicons name="checkmark" size={9} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.inlineFollowBtn,
              isFollowing && styles.inlineFollowBtnActive,
            ]}
            onPress={handleFollow}
            disabled={isFollowLoading}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {isFollowing && <Ionicons name="checkmark" size={12} color="#FFF" />}
              <Text style={[styles.inlineFollowText, isFollowing && styles.inlineFollowTextActive]}>
                {isFollowing ? 'Suivi' : 'Suivre'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.reelTitle} numberOfLines={2}>{item.title}</Text>

        {item.description ? (
          <Text style={styles.reelDesc} numberOfLines={3} ellipsizeMode="tail">{item.description}</Text>
        ) : null}

        {/* Sound bar animation placeholder */}
        <View style={styles.soundRow}>
          <Ionicons name="musical-note" size={14} color="#FFF" />
          <Text style={styles.soundText} numberOfLines={1}>{item.title}</Text>
        </View>
      </View>
    </View>
  );
});

export default function ReelsScreen() {
  const { videoId } = useLocalSearchParams<{ videoId?: string }>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + (insets.bottom > 0 ? insets.bottom : 10);
  const containerHeight = Math.round(windowHeight - tabBarHeight);

  const flatListRef = useRef<FlatList>(null);
  
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const {
    data: res,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['reels-feed'],
    queryFn: () => videosAPI.list({ type: 'SHORT', limit: 30, sort: 'for_you' }),
  });

  const showAds = useShouldShowAds();
  const rawReels: Video[] = res?.data?.data ?? [];

  const reels = React.useMemo(() => {
    if (!showAds || rawReels.length < 4) return rawReels;
    const items: (Video | { id: string; isAd: boolean })[] = [];
    rawReels.forEach((reel, idx) => {
      items.push(reel);
      if ((idx + 1) % 6 === 0) {
        items.push({ id: `ad-slot-${idx}`, isAd: true });
      }
    });
    return items;
  }, [rawReels, showAds]);

  // Pause all when screen loses focus
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
      };
    }, [])
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && typeof topItem.index === 'number') {
        setActiveIndex(topItem.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 50,
  }).current;

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / containerHeight);
    if (index >= 0 && index < reels.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  }, [containerHeight, reels.length, activeIndex]);

  const handleOpenComments = useCallback((id: string) => {
    setSelectedVideoId(id);
    setIsCommentsVisible(true);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSkipAd = useCallback((index: number) => {
    if (index < reels.length - 1) {
      flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }, [reels.length]);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item.isAd) {
      return (
        <ReelAdCard
          containerHeight={containerHeight}
          onSkip={() => handleSkipAd(index)}
        />
      );
    }

    return (
      <ReelItem 
        item={item} 
        isActive={isScreenFocused && index === activeIndex} 
        isNearActive={Math.abs(index - activeIndex) <= 1}
        containerHeight={containerHeight}
        onOpenComments={handleOpenComments} 
      />
    );
  }, [activeIndex, handleOpenComments, isScreenFocused, containerHeight, handleSkipAd]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5A00" />
        <Text style={styles.loadingText}>Chargement des reels...</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="film-outline" size={60} color="#333" />
        <Text style={styles.emptyTitle}>Aucun reel disponible</Text>
        <Text style={styles.emptyText}>Les artistes n'ont pas encore publié de reels.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        data={reels}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        pagingEnabled={true}
        snapToInterval={Platform.OS === 'android' ? containerHeight : undefined}
        snapToAlignment={Platform.OS === 'android' ? 'start' : undefined}
        decelerationRate={Platform.OS === 'android' ? 'fast' : 'normal'}
        disableIntervalMomentum={Platform.OS === 'android'}
        bounces={false}
        overScrollMode="never"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        style={{ flex: 1, height: containerHeight }}
      />
      {/* Floating Create Reel Studio Button */}
      <TouchableOpacity
        style={[styles.createStudioBtn, { top: insets.top + 10 }]}
        onPress={() => {
          if (!user) {
            Alert.alert(
              'Connexion requise',
              'Vous devez être connecté pour accéder au Studio Reel.',
              [
                { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) },
                { text: 'Annuler', style: 'cancel' },
              ]
            );
            return;
          }
          router.push('/studio/create-reel' as any);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="camera" size={22} color="#FFF" />
        <Text style={styles.createStudioBtnText}>Créer un Reel</Text>
      </TouchableOpacity>

      <VideoCommentsSheet
        videoId={selectedVideoId}
        visible={isCommentsVisible}
        onClose={() => setIsCommentsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  createStudioBtn: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    gap: 6,
    zIndex: 100,
  },
  createStudioBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#FFF', marginTop: 12, fontSize: 16 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 20 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 8 },

  reelContainer: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Overlay de pause vidéo
  pauseOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pauseCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Overlay d'erreur vidéo
  errorOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  errorRetryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#FF5A00',
  },
  errorRetryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  // Dark gradient for readability
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'transparent',
  },

  // Right action bar
  actionBar: {
    position: 'absolute',
    right: 14,
    bottom: 24,
    alignItems: 'center',
    gap: 20,
  },
  artistAvatarWrap: { position: 'relative', marginBottom: 4 },
  artistAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  artistAvatarFallback: {
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  followPlusBadge: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },

  actionBtn: { alignItems: 'center', gap: 4 },
  actionCount: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },

  // Bottom info
  bottomInfo: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 80,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  artistNameBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  artistName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  verifiedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineFollowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  inlineFollowBtnActive: {
    backgroundColor: '#FF5A00',
    borderColor: '#FF5A00',
  },
  inlineFollowText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  inlineFollowTextActive: { color: '#FFF' },

  reelTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
    lineHeight: 20,
  },
  reelDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soundText: {
    color: '#FFF',
    fontSize: 12,
    opacity: 0.9,
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});


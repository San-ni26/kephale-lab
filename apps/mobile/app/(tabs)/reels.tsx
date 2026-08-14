import React, { useCallback, useRef, useState, useReducer } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Pressable, Platform, useWindowDimensions
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY PATTERN — Architecture "zéro re-render" pour le scroll fluide
//
// Principe :
//   Chaque ReelVideoPlayer s'enregistre dans le registry à son montage.
//   Le FlatList appelle directement activate()/deactivate() sur les players
//   via onMomentumScrollEnd → AUCUN setState global → AUCUN re-render des items.
//   Résultat : scroll 60fps garanti, lecture instantanée au retour.
// ─────────────────────────────────────────────────────────────────────────────

type PlayerEntry = {
  activate: () => void;
  deactivate: () => void;
};

type PlayerRegistry = Map<number, PlayerEntry>;

// ─────────────────────────────────────────────────────────────────────────────
// ReelVideoPlayer — Player memoïsé contrôlé uniquement via le registry
// ─────────────────────────────────────────────────────────────────────────────

const ReelVideoPlayer = React.memo(function ReelVideoPlayer({
  item,
  itemIndex,
  registryRef,
  containerHeight,
}: {
  item: Video;
  itemIndex: number;
  registryRef: React.MutableRefObject<PlayerRegistry>;
  containerHeight: number;
}) {
  const { setPlaying: setGlobalIsPlaying } = usePlayerStore();
  // État local uniquement pour l'icône play/pause — ne déclenche PAS de re-render du parent
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const lastTimeRef = useRef(0);
  const hasSentWatchRef = useRef(false);
  const isActiveRef = useRef(false);

  const player = useVideoPlayer(item.videoUrl, (p) => {
    try {
      p.loop = true;
      p.muted = false;
      // Démarrer en pause — activation via le registry
      p.pause();
    } catch {}
  });

  // Tracking du temps de lecture pour les analytics
  React.useEffect(() => {
    let subStatus: any = null;
    let subTime: any = null;
    try {
      if (player && typeof player.addListener === 'function') {
        subStatus = player.addListener('statusChange', (status) => {
          if ((status as any)?.error) setVideoError(true);
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

  // ── Enregistrement dans le registry ──────────────────────────────────────
  React.useEffect(() => {
    const entry: PlayerEntry = {
      activate: () => {
        if (isActiveRef.current) return; // Déjà actif
        isActiveRef.current = true;
        hasSentWatchRef.current = false;
        setIsPlaying(true);
        setGlobalIsPlaying(false); // Couper le GlobalAudioPlayer
        try { player.play(); } catch {}
      },
      deactivate: () => {
        if (!isActiveRef.current) return;
        isActiveRef.current = false;
        setIsPlaying(false);
        try { player.pause(); } catch {}
        // Envoyer analytics si l'utilisateur a regardé ≥ 2s
        const t = lastTimeRef.current;
        if (t >= 2 && !hasSentWatchRef.current) {
          hasSentWatchRef.current = true;
          videosAPI.watch(item.id, { watchDurationSec: t, completed: false }).catch(() => {});
        }
      },
    };

    registryRef.current.set(itemIndex, entry);

    return () => {
      // Nettoyage : désactiver proprement à l'unmount
      if (isActiveRef.current) {
        isActiveRef.current = false;
        try { player.pause(); } catch {}
        const t = lastTimeRef.current;
        if (t >= 2 && !hasSentWatchRef.current) {
          hasSentWatchRef.current = true;
          videosAPI.watch(item.id, { watchDurationSec: t, completed: false }).catch(() => {});
        }
      }
      registryRef.current.delete(itemIndex);
    };
  }, [itemIndex, player, registryRef, item.id, setGlobalIsPlaying]);

  const handlePress = useCallback(() => {
    if (isActiveRef.current) {
      if (isPlaying) {
        setIsPlaying(false);
        try { player.pause(); } catch {}
      } else {
        setIsPlaying(true);
        try { player.play(); } catch {}
      }
    }
  }, [isPlaying, player]);

  return (
    <Pressable
      style={[styles.video, { height: containerHeight }]}
      onPress={handlePress}
    >
      {/* Miniature toujours visible en arrière-plan (évite l'écran noir) */}
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

// ─────────────────────────────────────────────────────────────────────────────
// ReelItem — Rendu stable grâce au registry (pas de prop isActive)
// Mémoïsé par référence de `item` uniquement
// ─────────────────────────────────────────────────────────────────────────────

const ReelItem = React.memo(function ReelItem({
  item,
  itemIndex,
  registryRef,
  shouldMountPlayer,
  containerHeight,
  onOpenComments,
}: {
  item: Video & { hasLiked?: boolean };
  itemIndex: number;
  registryRef: React.MutableRefObject<PlayerRegistry>;
  shouldMountPlayer: boolean;
  containerHeight: number;
  onOpenComments: (id: string) => void;
}) {
  const liked = item.hasLiked ?? false;
  const likeCount = item._count?.likes ?? 0;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { downloads, downloading, downloadVideo, removeDownload } = useOfflineStore();

  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const likeMutation = useMutation({
    mutationFn: () => videosAPI.like(item.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['reels-feed'] });
      const previous = queryClient.getQueryData(['reels-feed']);
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
                    likes: wasLiked
                      ? Math.max(0, (video._count?.likes ?? 1) - 1)
                      : (video._count?.likes ?? 0) + 1,
                  },
                };
              }
              return video;
            }),
          },
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['reels-feed'], context.previous);
    },
  });

  const handleLike = useCallback(() => {
    if (!user) { router.push('/(auth)/welcome'); return; }
    likeMutation.mutate();
  }, [user, likeMutation]);

  const handleFollow = useCallback(async () => {
    if (!user) { router.push('/(auth)/welcome'); return; }
    if (!item.artist?.id || isFollowLoading) return;
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setIsFollowLoading(true);
    try {
      if (wasFollowing) await artistsAPI.unfollow(item.artist.id);
      else await artistsAPI.follow(item.artist.id);
    } catch {
      setIsFollowing(wasFollowing);
    } finally {
      setIsFollowLoading(false);
    }
  }, [user, item.artist?.id, isFollowLoading, isFollowing]);

  const isOwner =
    !!user &&
    ((item as any).userId === user.id ||
      item.artist?.id === user.artistProfile?.id ||
      (user.artistProfile && item.artistId === user.artistProfile.id) ||
      (user as any).role === 'ADMIN');

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

  const handleDeleteReel = useCallback(() => {
    Alert.alert(
      'Supprimer le Reel',
      `Voulez-vous supprimer définitivement "${item.title}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteReelMutation.mutate() },
      ]
    );
  }, [item.title, deleteReelMutation]);

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <View style={[styles.reelContainer, { height: containerHeight }]}>
      <StatusBar style="light" />

      {/* Player monté pour les items actifs et adjacents */}
      {shouldMountPlayer && !!item.videoUrl ? (
        <ReelVideoPlayer
          item={item}
          itemIndex={itemIndex}
          registryRef={registryRef}
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

      {/* Dark gradient */}
      <View style={styles.gradient} pointerEvents="none" />

      {/* Right Action Bar */}
      <View style={styles.actionBar}>
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

        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={30}
            color={liked ? '#EF4444' : '#FFF'}
          />
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item._count?.comments ?? 0)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="arrow-redo-outline" size={28} color="#FFF" />
          <Text style={styles.actionCount}>Partager</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="eye-outline" size={24} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item.views)}</Text>
        </TouchableOpacity>

        {downloads[item.id] ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              Alert.alert('Supprimer', 'Supprimer ce clip des fichiers hors ligne ?', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(item.id) },
              ])
            }
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
            style={[styles.inlineFollowBtn, isFollowing && styles.inlineFollowBtnActive]}
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
          <Text style={styles.reelDesc} numberOfLines={3} ellipsizeMode="tail">
            {item.description}
          </Text>
        ) : null}

        <View style={styles.soundRow}>
          <Ionicons name="musical-note" size={14} color="#FFF" />
          <Text style={styles.soundText} numberOfLines={1}>{item.title}</Text>
        </View>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ReelsScreen — Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function ReelsScreen() {
  const { videoId } = useLocalSearchParams<{ videoId?: string }>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + (insets.bottom > 0 ? insets.bottom : 10);
  const containerHeight = Math.round(windowHeight - tabBarHeight);

  // ── Registry : contrôle play/pause sans re-render ─────────────────────────
  const registryRef = useRef<PlayerRegistry>(new Map());
  const activeIndexRef = useRef<number>(0);

  // État local UNIQUEMENT pour décider quels items montent le <ReelVideoPlayer>
  // (windowSize=5 du FlatList gère déjà le pre-mount, ce state ne sert qu'aux
  //  items HORS fenêtre de virtualisation qu'on veut garder montés)
  const [mountedCenter, setMountedCenter] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isScreenFocusedRef = useRef(true);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: ({ pageParam = 1 }) =>
      videosAPI.list({ type: 'SHORT', limit: 10, page: pageParam, sort: 'for_you' }),
    getNextPageParam: (lastPage: any) => {
      const pagination = lastPage?.data?.pagination;
      return pagination?.hasNext ? pagination.page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  // Aplatir toutes les pages en un seul tableau
  const rawReels: Video[] = React.useMemo(
    () => infiniteData?.pages?.flatMap((page: any) => page?.data?.data ?? []) ?? [],
    [infiniteData]
  );

  const showAds = useShouldShowAds();
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

  // ── Fonction centrale d'activation (zéro setState pendant le scroll) ──────
  const activateIndex = useCallback((newIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(newIndex, reels.length - 1));

    if (!isScreenFocusedRef.current) {
      // Écran inactif → désactiver tout silencieusement
      registryRef.current.get(activeIndexRef.current)?.deactivate();
      activeIndexRef.current = clampedIndex;
      return;
    }

    if (clampedIndex === activeIndexRef.current) {
      // Même index → juste s'assurer que la vidéo joue (retour rapide)
      registryRef.current.get(clampedIndex)?.activate();
      return;
    }

    // Désactiver l'ancienne vidéo
    registryRef.current.get(activeIndexRef.current)?.deactivate();

    // Activer la nouvelle
    activeIndexRef.current = clampedIndex;
    registryRef.current.get(clampedIndex)?.activate();

    // Mettre à jour le center pour que le FlatList monte les players adjacents
    setMountedCenter(clampedIndex);
  }, [reels.length]);

  // ── Pause/Resume sur changement de focus ─────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      // Réactiver la vidéo courante au retour sur l'écran
      registryRef.current.get(activeIndexRef.current)?.activate();
      return () => {
        isScreenFocusedRef.current = false;
        registryRef.current.get(activeIndexRef.current)?.deactivate();
      };
    }, [])
  );

  // ── Scroll handlers ───────────────────────────────────────────────────────

  // Trigger principal : onMomentumScrollEnd → scroll s'est arrêté → activation propre
  const handleMomentumScrollEnd = useCallback((e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const newIndex = Math.round(offsetY / containerHeight);
    activateIndex(newIndex);
  }, [containerHeight, activateIndex]);

  // Trigger secondaire : viewability → filet de sécurité pour les cas limites
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && typeof topItem.index === 'number') {
        activateIndex(topItem.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80, // L'item doit être à 80% visible
    minimumViewTime: 150,            // 150ms minimum pour éviter les activations pendant le scroll
  }).current;

  // ── Navigation vers un videoId spécifique (depuis une notification) ───────
  React.useEffect(() => {
    if (videoId && reels.length > 0) {
      const idx = reels.findIndex((r: any) => r.id === videoId);
      if (idx >= 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: idx, animated: false });
          activateIndex(idx);
        }, 200);
      }
    }
  }, [videoId, reels, activateIndex]);

  const handleOpenComments = useCallback((id: string) => {
    setSelectedVideoId(id);
    setIsCommentsVisible(true);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refetch(); } catch {}
    setIsRefreshing(false);
  };

  // Charger la page suivante quand on approche de la fin (infinite scroll)
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSkipAd = useCallback((index: number) => {
    if (index < reels.length - 1) {
      flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }, [reels.length]);

  // ── renderItem stable — ne dépend PAS de activeIndex/mountedCenter state ──
  // shouldMountPlayer est calculé localement dans chaque item via un ref snapshot
  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item.isAd) {
      return (
        <ReelAdCard
          containerHeight={containerHeight}
          onSkip={() => handleSkipAd(index)}
        />
      );
    }

    // On monte le player pour l'item actif et son voisin immédiat uniquement
    // Cohérent avec windowSize=3 (1 avant + 1 actif + 1 après)
    const shouldMountPlayer = Math.abs(index - mountedCenter) <= 1;

    return (
      <ReelItem
        item={item}
        itemIndex={index}
        registryRef={registryRef}
        shouldMountPlayer={shouldMountPlayer}
        containerHeight={containerHeight}
        onOpenComments={handleOpenComments}
      />
    );
  }, [containerHeight, handleOpenComments, handleSkipAd, mountedCenter]);

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

        // ── Snap page-par-page (style TikTok) ─────────────────────────────
        pagingEnabled={Platform.OS === 'ios'}
        snapToInterval={containerHeight}
        snapToAlignment="start"
        decelerationRate="fast"          // Arrêt net comme TikTok
        disableIntervalMomentum={true}   // Empêche de sauter plusieurs pages d'un coup
        bounces={false}
        overScrollMode="never"

        // ── Performance ───────────────────────────────────────────────────
        scrollEventThrottle={16}         // 60fps
        initialNumToRender={1}           // Rendre 1 item au démarrage
        maxToRenderPerBatch={2}          // Rendre 2 items par batch
        windowSize={3}                   // 1 avant + 1 actif + 1 après = 3 players max en mémoire
        removeClippedSubviews={false}    // IMPORTANT: false pour garder les players montés

        // ── Handlers ─────────────────────────────────────────────────────
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onEndReached={handleEndReached}  // Infinite scroll
        onEndReachedThreshold={0.5}      // Déclencher 50% avant la fin

        // ── Layout ───────────────────────────────────────────────────────
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        style={{ flex: 1, height: containerHeight }}
      />

      {/* Bouton Studio Reel */}
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

  errorOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  errorRetryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#FF5A00',
  },
  errorRetryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'transparent',
  },

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

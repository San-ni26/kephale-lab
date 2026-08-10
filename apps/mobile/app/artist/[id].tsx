import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, ActivityIndicator, FlatList, Dimensions, Alert, Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';
import { artistsAPI, tracksAPI, purchasesAPI, userAPI, chatAPI } from '../../src/lib/api';
import { useAuthStore, usePlayerStore } from '../../src/stores';
import PaymentMethodModal from '../../src/components/PaymentMethodModal';
import ArtistReelsModal from '../../src/components/ArtistReelsModal';
import NotificationSettingsModal from '../../src/components/NotificationSettingsModal';
import type { Track, Video, Album } from '@kephale/types';

const { width: SCREEN_W } = Dimensions.get('window');
const HEADER_HEIGHT = 260;

type Tab = 'musique' | 'clips' | 'reels' | 'apropos';

export default function ArtistPublicPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { setTrack } = usePlayerStore();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [tab, setTab] = useState<Tab>('musique');
  const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
  const [paymentModalData, setPaymentModalData] = useState<{ type: 'TRACK'; id: string; price: number; currency: string } | null>(null);
  const [reelsModalVisible, setReelsModalVisible] = useState(false);
  const [initialReelIndex, setInitialReelIndex] = useState(0);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handlePlayTrack = async (track: any, allTracks: any[]) => {
    const trackWithArtist = {
      ...track,
      coverUrl: track.coverUrl || track.album?.coverUrl || artist?.avatar || artist?.coverImage,
      artist: track.artist || { id: artist?.id, stageName: artist?.stageName, avatar: artist?.avatar },
    };
    const allTracksWithArtist = allTracks.map((t) => ({
      ...t,
      coverUrl: t.coverUrl || t.album?.coverUrl || artist?.avatar || artist?.coverImage,
      artist: t.artist || { id: artist?.id, stageName: artist?.stageName, avatar: artist?.avatar },
    }));

    if (track.price > 0 && !isTrackPurchased(track.id)) {
      if (!user) {
        Alert.alert('Connexion requise', 'Vous devez être connecté pour écouter ou acheter ce morceau.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
        ]);
        return;
      }

      try {
        const streamRes = await tracksAPI.getStreamUrl(track.id);
        const streamUrl = streamRes.data?.data?.streamUrl;
        const playableTrack = {
          ...trackWithArtist,
          ...(streamUrl ? { audioUrl: streamUrl } : {}),
        };
        setTrack(playableTrack, allTracksWithArtist);
      } catch (err: any) {
        if (err.response?.status === 401) {
          Alert.alert('Connexion requise', 'Vous devez être connecté pour écouter ou acheter ce morceau.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
          ]);
        } else if (err.response?.status === 403) {
          Alert.alert(
            'Titre payant',
            `Ce morceau coûte ${track.price} XOF. Voulez-vous l'acheter pour l'écouter ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Acheter',
                onPress: () => {
                  if (!user) {
                    Alert.alert('Connexion requise', 'Vous devez être connecté pour effectuer un achat.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
                    ]);
                    return;
                  }
                  setPaymentModalData({ type: 'TRACK', id: track.id, price: track.price, currency: track.currency || 'XOF' });
                },
              },
            ]
          );
        } else {
          Alert.alert('Erreur', "Impossible de vérifier l'accès au morceau.");
        }
      }
    } else {
      setTrack(trackWithArtist, allTracksWithArtist);
    }
  };

  const executePayment = async (provider: 'TOKEN') => {
    if (!paymentModalData) return;
    const { type, id } = paymentModalData;
    
    setPaymentModalData(null);
    setIsProcessingPayment(id);
    
    try {
      const res = await purchasesAPI.payWithTokens({ type, itemId: id });
      if (res.data?.success) {
        Alert.alert('Succès', 'Achat réussi ! Vous pouvez maintenant écouter ce morceau.');
        queryClient.invalidateQueries({ queryKey: ['my-purchases'] });
        useAuthStore.getState().updateUser({ tokenBalance: res.data.data.newBalance });
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'Erreur lors du paiement');
    } finally {
      setIsProcessingPayment(null);
    }
  };

  // Artist profile + stats
  const { data: artistData, isLoading: artistLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => artistsAPI.getById(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: statsData } = useQuery({
    queryKey: ['artist-stats', id],
    queryFn: () => artistsAPI.getStats(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  // Tracks
  const { data: tracksData, isLoading: tracksLoading, error: tracksError } = useQuery({
    queryKey: ['artist-tracks', id],
    queryFn: () => artistsAPI.getTracks(id!, { limit: 50 }),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  // Albums
  const { data: albumsData, error: albumsError } = useQuery({
    queryKey: ['artist-albums', id],
    queryFn: () => artistsAPI.getAlbums(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  // Clips
  const { data: clipsData, isLoading: clipsLoading } = useQuery({
    queryKey: ['artist-clips', id],
    queryFn: () => artistsAPI.getVideos(id!, { type: 'CLIP', limit: 30 }),
    enabled: !!id && tab === 'clips',
    staleTime: 1000 * 60 * 5,
  });

  // Reels
  const { data: reelsData, isLoading: reelsLoading } = useQuery({
    queryKey: ['artist-reels', id],
    queryFn: () => artistsAPI.getVideos(id!, { type: 'SHORT', limit: 30 }),
    enabled: !!id && tab === 'reels',
    staleTime: 1000 * 60 * 5,
  });

  // Fetch purchases
  const { data: purchasesData } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data?.data || res.data || [];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const artist = artistData?.data?.data ?? artistData?.data;
  const stats = statsData?.data?.data ?? statsData?.data;
  const tracks: Track[] = Array.isArray(tracksData?.data?.data)
    ? tracksData.data.data
    : Array.isArray(tracksData?.data)
    ? tracksData.data
    : [];
  const albums: Album[] = Array.isArray(albumsData?.data?.data)
    ? albumsData.data.data
    : Array.isArray(albumsData?.data)
    ? albumsData.data
    : [];
  const clips: Video[] = Array.isArray(clipsData?.data?.data)
    ? clipsData.data.data
    : Array.isArray(clipsData?.data)
    ? clipsData.data
    : [];
  const reels: Video[] = Array.isArray(reelsData?.data?.data)
    ? reelsData.data.data
    : Array.isArray(reelsData?.data)
    ? reelsData.data
    : [];
  const purchases = purchasesData || [];

  const isTrackPurchased = (trackId: string) => {
    return purchases.some((p: any) => p.trackId === trackId);
  };

  // Follow / Unfollow
  const { data: followStatusData, refetch: refetchFollowStatus } = useQuery({
    queryKey: ['artist-follow-status', id],
    queryFn: () => artistsAPI.getFollowStatus(id!),
    enabled: !!id && !!user,
  });
  
  const isFollowing = followStatusData?.data?.data?.isFollowing || false;
  const followData = followStatusData?.data?.data?.follow;

  const followMutation = useMutation({
    mutationFn: () => artistsAPI.follow(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-stats', id] });
      refetchFollowStatus();
    },
  });
  const unfollowMutation = useMutation({
    mutationFn: () => artistsAPI.unfollow(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-stats', id] });
      refetchFollowStatus();
    },
  });

  const handleToggleFollow = () => {
    if (!user) {
      return Alert.alert('Connexion requise', 'Connectez-vous pour vous abonner.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
      ]);
    }
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const handleContact = () => {
    if (!user) {
      return Alert.alert('Connexion requise', 'Connectez-vous pour envoyer un message.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
      ]);
    }
    
    const cachedConversations: any = queryClient.getQueryData(['conversations']);
    const existingConv = cachedConversations?.data?.data?.find((c: any) => c.user1Id === artist.userId || c.user2Id === artist.userId);

    if (existingConv) {
       router.push(`/chat/${existingConv.id}` as any);
       return;
    }
    
    setPromptVisible(true);
    setPromptMessage('');
  };

  const handleSendRequest = async () => {
    if (!promptMessage.trim()) return;
    setSending(true);
    try {
      const res = await chatAPI.requestConversation(artist.userId, promptMessage);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setPromptVisible(false);
      const convId = res.data.data.conversation.id;
      router.push(`/chat/${convId}`);
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.error?.message || "Impossible d'envoyer la demande.");
    } finally {
      setSending(false);
    }
  };

  // Animated header parallax
  const coverTranslate = scrollY.interpolate({
    inputRange: [-100, 0, HEADER_HEIGHT],
    outputRange: [50, 0, -60],
    extrapolate: 'clamp',
  });
  const coverOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT * 0.6],
    outputRange: [1, 0.3],
    extrapolate: 'clamp',
  });
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [HEADER_HEIGHT - 80, HEADER_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  if (artistLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      </SafeAreaView>
    );
  }

  if (!artist) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Artiste introuvable</Text>
          <TouchableOpacity style={styles.backCta} onPress={() => router.back()}>
            <Text style={styles.backCtaText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'musique', label: 'Musique' },
    { key: 'clips', label: 'Clips' },
    { key: 'reels', label: 'Reels' },
    { key: 'apropos', label: 'À propos' },
  ];

  return (
    <View style={styles.container}>
      {/* Animated sticky header */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerBgOpacity, paddingTop: insets.top }]}>
        <Text style={styles.stickyTitle} numberOfLines={1}>{artist.stageName}</Text>
      </Animated.View>

      {/* Back button */}
      <TouchableOpacity
        style={[styles.floatBack, { top: insets.top + 8 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* Hero / Cover with parallax */}
        <Animated.View style={[styles.heroContainer, { transform: [{ translateY: coverTranslate }], opacity: coverOpacity }]}>
          {artist.coverImage ? (
            <Image 
              source={{ uri: artist.coverImage }} 
              style={styles.coverImage} 
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.coverImage, styles.coverFallback]}>
              <Text style={styles.coverFallbackText}>{artist.stageName[0]}</Text>
            </View>
          )}
          <View style={styles.coverGradient} />
        </Animated.View>

        {/* Artist Info */}
        <View style={styles.artistInfoSection}>
          <View style={styles.artistAvatarRow}>
            {artist.avatar ? (
              <Image 
                source={{ uri: artist.avatar }} 
                style={styles.avatar} 
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{artist.stageName[0]}</Text>
              </View>
            )}
            <View style={styles.artistMeta}>
              <View style={styles.nameRow}>
                <Text style={styles.artistName}>{artist.stageName}</Text>
                {artist.isVerified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark" size={11} color="#FFF" />
                  </View>
                )}
              </View>
              <Text style={styles.artistCountry}>
                {artist.country} · {artist.genre?.slice(0, 2).join(', ')}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Abonnés', value: (stats?.followersCount ?? artist.totalFollowers ?? 0).toLocaleString() },
              { label: 'Titres', value: (stats?.tracksCount ?? 0).toLocaleString() },
              { label: 'Écoutes', value: (stats?.totalPlays ?? 0).toLocaleString() },
            ].map((s, i) => (
              <View key={i} style={styles.statItem}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          {user && (
            <View style={styles.actionRow}>
              {artist.userId === user.id ? (
                <TouchableOpacity
                  style={styles.editProfileCta}
                  onPress={() => router.push('/artist-dashboard/edit-profile')}
                >
                  <Text style={styles.editProfileCtaText}>Modifier le profil</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.followBtn, isFollowing && styles.followingBtn]}
                      onPress={handleToggleFollow}
                      disabled={followMutation.isPending || unfollowMutation.isPending}
                    >
                      <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                        {isFollowing ? 'Abonné' : "S'abonner"}
                      </Text>
                    </TouchableOpacity>
                    {isFollowing && (
                      <TouchableOpacity
                        style={styles.bellBtn}
                        onPress={() => setNotifModalVisible(true)}
                      >
                        <Ionicons name={followData?.notifyAll ? "notifications" : "notifications-outline"} size={20} color={followData?.notifyAll ? "#FF5A00" : "#FFF"} />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={handleContact}
                  >
                    <Text style={styles.contactBtnText}>Contacter</Text>
                  </TouchableOpacity>
                </>
              )}
              
              <TouchableOpacity style={styles.shareBtn}>
                <Ionicons name="share-outline" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab Content ── */}

        {/* MUSIQUE TAB */}
        {tab === 'musique' && (
          <View style={styles.tabContent}>
            {/* Albums */}
            {albums.length > 0 && (
              <>
                <Text style={styles.subTitle}>Albums</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                  {albums.map((album) => (
                    <TouchableOpacity
                      key={album.id}
                      style={styles.albumCard}
                      onPress={() => router.push(`/album/${album.id}`)}
                    >
                      <Image 
                        source={{ uri: album.coverUrl }} 
                        style={styles.albumCover} 
                        cachePolicy="memory-disk"
                        contentFit="cover"
                        transition={150}
                      />
                      <Text style={styles.albumTitle} numberOfLines={1}>{album.title}</Text>
                      <Text style={styles.albumMeta}>
                        {album._count?.tracks ?? 0} titres {album.releaseDate ? `· ${new Date(album.releaseDate).getFullYear()}` : ''}
                      </Text>
                      {album.price > 0 && (
                        <Text style={{ color: '#FF5A00', fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                          {album._count?.purchases ?? 0} vente{(album._count?.purchases ?? 0) > 1 ? 's' : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Morceaux */}
            <Text style={styles.subTitle}>Morceaux</Text>
            {tracksLoading ? (
              <ActivityIndicator color="#FF5A00" style={{ marginTop: 20 }} />
            ) : tracks.length === 0 ? (
              <Text style={styles.emptyText}>Aucun morceau publié.</Text>
            ) : (
              tracks.map((track, idx) => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.trackRow}
                  onPress={() => handlePlayTrack(track, tracks)}
                >
                  <Text style={styles.trackIdx}>{idx + 1}</Text>
                  <Image 
                    source={{ uri: track.coverUrl || track.album?.coverUrl || artist?.avatar || artist?.coverImage }} 
                    style={styles.trackCover} 
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    transition={150}
                  />
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.trackMeta}>{track.plays.toLocaleString()} écoutes</Text>
                    {track.price > 0 && (
                      <Text style={{ color: '#A0A0A0', fontSize: 11, marginTop: 2 }}>
                        {track._count?.purchases ?? 0} vente{(track._count?.purchases ?? 0) > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                  {track.price > 0 ? (
                    isTrackPurchased(track.id) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>Acheté</Text>
                      </View>
                    ) : (
                      <Text style={styles.trackPrice}>{track.price.toLocaleString()} XOF</Text>
                    )
                  ) : (
                    <Ionicons name="play-circle-outline" size={22} color="#FF5A00" />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* CLIPS TAB */}
        {tab === 'clips' && (
          <View style={styles.tabContent}>
            {clipsLoading ? (
              <ActivityIndicator color="#8B5CF6" style={{ marginTop: 40 }} />
            ) : clips.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={48} color="#333" />
                <Text style={styles.emptyText}>Aucun clip publié.</Text>
              </View>
            ) : (
              <View style={styles.videoGrid}>
                {clips.map((clip) => (
                  <TouchableOpacity
                    key={clip.id}
                    style={styles.videoGridItem}
                    onPress={() => router.push(`/clip/${clip.id}`)}
                  >
                    <VideoThumbnail 
                      sourceUrl={clip.thumbnailUrl}
                      videoUrl={clip.videoUrl}
                      style={styles.videoThumb} 
                    />
                    <View style={styles.videoOverlay}>
                      <Ionicons name="play" size={20} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.videoTitle} numberOfLines={1}>{clip.title}</Text>
                    <Text style={styles.videoViews}>{clip.views.toLocaleString()} vues</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* REELS TAB */}
        {tab === 'reels' && (
          <View style={styles.tabContent}>
            {reelsLoading ? (
              <ActivityIndicator color="#06B6D4" style={{ marginTop: 40 }} />
            ) : reels.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="videocam-outline" size={48} color="#333" />
                <Text style={styles.emptyText}>Aucun reel publié.</Text>
              </View>
            ) : (
              <View style={styles.reelsGrid}>
                {reels.map((reel, index) => (
                  <TouchableOpacity
                    key={reel.id}
                    style={styles.reelGridItem}
                    onPress={() => {
                      setInitialReelIndex(index);
                      setReelsModalVisible(true);
                    }}
                  >
                    <VideoThumbnail 
                      sourceUrl={reel.thumbnailUrl}
                      videoUrl={reel.videoUrl}
                      style={styles.reelThumb} 
                    />
                    <View style={styles.reelOverlay}>
                      <Ionicons name="play" size={18} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.reelViews}>{reel.views.toLocaleString()}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* À PROPOS TAB */}
        {tab === 'apropos' && (
          <View style={styles.tabContent}>
            {artist.bio ? (
              <View style={styles.bioBox}>
                <Text style={styles.bioText}>{artist.bio}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>Aucune biographie.</Text>
            )}

            {/* Genres */}
            {artist.genre?.length > 0 && (
              <>
                <Text style={styles.subTitle}>Genres</Text>
                <View style={styles.genresRow}>
                  {artist.genre.map((g: string) => (
                    <View key={g} style={styles.genreChip}>
                      <Text style={styles.genreChipText}>{g}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Liens sociaux */}
            {(artist.websiteUrl || artist.instagramUrl || artist.twitterUrl) && (
              <>
                <Text style={styles.subTitle}>Liens</Text>
                <View style={styles.linksBox}>
                  {artist.instagramUrl && (
                    <View style={styles.linkRow}>
                      <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                      <Text style={styles.linkText}>{artist.instagramUrl}</Text>
                    </View>
                  )}
                  {artist.twitterUrl && (
                    <View style={styles.linkRow}>
                      <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
                      <Text style={styles.linkText}>{artist.twitterUrl}</Text>
                    </View>
                  )}
                  {artist.websiteUrl && (
                    <View style={styles.linkRow}>
                      <Ionicons name="globe-outline" size={20} color="#888" />
                      <Text style={styles.linkText}>{artist.websiteUrl}</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            <Text style={styles.memberSince}>
              Membre depuis {new Date(artist.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </Animated.ScrollView>

      {paymentModalData && (
        <PaymentMethodModal
          visible={!!paymentModalData}
          onClose={() => setPaymentModalData(null)}
          onSelect={(method) => executePayment(method)}
          price={paymentModalData.price}
          currency={paymentModalData.currency}
        />
      )}

      {/* REELS MODAL */}
      <ArtistReelsModal
        visible={reelsModalVisible}
        onClose={() => setReelsModalVisible(false)}
        reels={reels}
        initialIndex={initialReelIndex}
      />

      {/* NOTIFICATIONS MODAL */}
      {isFollowing && followData && (
        <NotificationSettingsModal
          visible={notifModalVisible}
          onClose={() => setNotifModalVisible(false)}
          artistId={id!}
          initialPrefs={{
            notifyAll: followData.notifyAll,
            notifyAlbums: followData.notifyAlbums,
            notifyTracks: followData.notifyTracks,
            notifyVideos: followData.notifyVideos,
          }}
        />
      )}

      {/* CUSTOM PROMPT MODAL */}
      <Modal visible={promptVisible} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouveau message</Text>
            <Text style={styles.modalDesc}>Écrivez votre premier message (il expirera dans 24H si non accepté) :</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Salut, j'adore ton travail..."
              placeholderTextColor="#888"
              value={promptMessage}
              onChangeText={setPromptMessage}
              autoFocus
              multiline
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnCancel]} 
                onPress={() => setPromptVisible(false)}
                disabled={sending}
              >
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnSubmit]} 
                onPress={handleSendRequest}
                disabled={sending || !promptMessage.trim()}
              >
                {sending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnSubmitText}>Envoyer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 16 },
  backCta: { backgroundColor: '#FF5A00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30 },
  backCtaText: { color: '#FFF', fontWeight: '700' },

  stickyHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 60,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  stickyTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  floatBack: {
    position: 'absolute',
    left: 16,
    zIndex: 200,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroContainer: {
    height: HEADER_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: HEADER_HEIGHT + 60,
    resizeMode: 'cover',
  },
  coverFallback: {
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverFallbackText: { color: '#333', fontSize: 80, fontWeight: '900' },
  coverGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 100,
    backgroundColor: 'rgba(10,10,10,0.7)',
  },

  artistInfoSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  artistAvatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, marginRight: 16, borderWidth: 3, borderColor: '#FF5A00' },
  avatarFallback: { backgroundColor: '#FF5A00', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  artistMeta: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  artistName: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistCountry: { color: '#888', fontSize: 13 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#888', fontSize: 11, marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  followBtn: {
    flex: 1,
    backgroundColor: '#FF5A00',
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: 'center',
  },
  followBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  followingBtn: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333' },
  followingBtnText: { color: '#FFF' },
  bellBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  contactBtn: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  contactBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  shareBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  editProfileCta: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF5A00',
  },
  editProfileCtaText: { color: '#FF5A00', fontWeight: '700', fontSize: 15 },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    marginTop: 8,
    backgroundColor: '#0A0A0A',
  },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#FF5A00' },
  tabText: { color: '#666', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#FF5A00' },

  tabContent: { paddingTop: 16 },
  subTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 14,
    marginTop: 8,
  },

  // Tracks
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  trackIdx: { color: '#555', fontSize: 13, width: 22, textAlign: 'center' },
  trackCover: { width: 46, height: 46, borderRadius: 8, marginHorizontal: 12 },
  trackInfo: { flex: 1 },
  trackTitle: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  trackMeta: { color: '#888', fontSize: 12, marginTop: 3 },
  trackPrice: { color: '#FF5A00', fontSize: 13, fontWeight: '700' },

  // Albums
  albumCard: { width: 130, marginRight: 14 },
  albumCover: { width: 130, height: 130, borderRadius: 12, marginBottom: 8 },
  albumTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  albumMeta: { color: '#888', fontSize: 11, marginTop: 2 },

  // Videos grid
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  videoGridItem: { width: (SCREEN_W - 44) / 2 },
  videoThumb: { width: '100%', height: 120, borderRadius: 12, marginBottom: 6 },
  videoOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: { color: '#FFF', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  videoViews: { color: '#888', fontSize: 11 },

  // Reels grid (3 columns)
  reelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, justifyContent: 'center' },
  reelGridItem: { 
    width: (SCREEN_W - 40) / 3, 
    height: (SCREEN_W - 40) / 3 * 1.6, 
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A'
  },
  reelThumb: { width: '100%', height: '100%', borderRadius: 12 },
  reelOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reelViews: { color: '#FFF', fontSize: 11, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },

  // À propos
  bioBox: {
    marginHorizontal: 20,
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  bioText: { color: '#CCC', fontSize: 15, lineHeight: 24 },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 30,
    backgroundColor: '#FF5A0022',
    borderWidth: 1,
    borderColor: '#FF5A0044',
  },
  genreChipText: { color: '#FF5A00', fontWeight: '600', fontSize: 13 },
  linksBox: { marginHorizontal: 20, backgroundColor: '#141414', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  linkText: { color: '#CCC', fontSize: 14 },
  memberSince: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 },

  // Prompt Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#141414', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#222' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  modalDesc: { color: '#A0A0A0', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: '#000', borderRadius: 12, padding: 14, color: '#FFF', fontSize: 15, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#333', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#222' },
  modalBtnCancelText: { color: '#FFF', fontWeight: '600' },
  modalBtnSubmit: { backgroundColor: '#FF5A00' },
  modalBtnSubmitText: { color: '#FFF', fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 40 },
});

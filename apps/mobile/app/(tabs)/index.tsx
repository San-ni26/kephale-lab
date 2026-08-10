import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tracksAPI, livesAPI, artistsAPI, videosAPI, albumsAPI, purchasesAPI, userAPI, notificationsAPI } from '../../src/lib/api';
import { useAuthStore, usePlayerStore } from '../../src/stores/index';
import PaymentMethodModal from '../../src/components/PaymentMethodModal';
import { useToast } from '../../src/components/ToastContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import LiveSection from '../../src/components/home/LiveSection';
import ArtistSection from '../../src/components/home/ArtistSection';
import AlbumSection from '../../src/components/home/AlbumSection';
import TrackSection from '../../src/components/home/TrackSection';
import ClipList from '../../src/components/home/ClipList';
import LiveFeedList from '../../src/components/home/LiveFeedList';
import GenreCarousel from '../../src/components/home/GenreCarousel';

type HomeMode = 'musique' | 'clips' | 'live';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const { setTrack } = usePlayerStore();
  const { showToast } = useToast();
  const [mode, setMode] = useState<HomeMode>('musique');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
  const [paymentModalData, setPaymentModalData] = useState<{ type: 'TRACK'; id: string; price: number; currency: string } | null>(null);

  // Animated Header
  const scrollY = useRef(new Animated.Value(0)).current;
  const HEADER_HEIGHT = 160; // Height of Greeting + Search + Tabs

  const { opacity } = useMemo(() => {
    const diffClampY = Animated.diffClamp(scrollY, 0, HEADER_HEIGHT);
    const op = diffClampY.interpolate({
      inputRange: [0, HEADER_HEIGHT],
      outputRange: [1, 0],
    });
    return { opacity: op };
  }, [scrollY]);

  const handlePlayTrack = async (track: any, tracks: any[]) => {
    const isUnlocked = track.price === 0 || purchasedTrackIds.has(track.id);
    if (isUnlocked) {
      setTrack(track, tracks);
      return;
    }

    if (!isAuthenticated) {
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
        ...track,
        ...(streamUrl ? { audioUrl: streamUrl } : {}),
      };
      setTrack(playableTrack, tracks);
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
                if (!isAuthenticated) {
                  Alert.alert('Connexion requise', 'Vous devez être connecté pour effectuer un achat.', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
                  ]);
                  return;
                }
                setPaymentModalData({ type: 'TRACK', id: track.id, price: track.price, currency: track.currency });
              },
            },
          ]
        );
      } else {
        showToast('Impossible de vérifier l\'accès au morceau.', 'error');
      }
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
        showToast('Achat réussi ! Vous pouvez maintenant écouter ce morceau.', 'success');
        queryClient.invalidateQueries({ queryKey: ['my-purchases'] });
        useAuthStore.getState().updateUser({ tokenBalance: res.data.data.newBalance });
      }
    } catch (e: any) {
      showToast(e?.response?.data?.error?.message || 'Erreur lors du paiement', 'error');
    } finally {
      setIsProcessingPayment(null);
    }
  };

  // 1. Tracks (Music mode)
  const { data: tracksData, isLoading: isLoadingTracks } = useQuery({
    queryKey: ['tracks', 'latest', { isSingle: true, search: searchQuery, genre: selectedGenre }],
    queryFn: () => tracksAPI.list({ sort: 'newest', limit: 10, isSingle: true, search: searchQuery || undefined, genre: selectedGenre || undefined }),
    enabled: mode === 'musique',
    staleTime: 1000 * 60 * 5,
  });

  // 2. Artists (Music mode)
  const { data: artistsData, isLoading: isLoadingArtists } = useQuery({
    queryKey: ['artists', 'featured', searchQuery],
    queryFn: () => artistsAPI.list({ search: searchQuery || undefined }),
    enabled: mode === 'musique',
    staleTime: 1000 * 60 * 5,
  });

  // 3. Albums (Music mode)
  const { data: homeAlbumsData, isLoading: isLoadingAlbums } = useQuery({
    queryKey: ['albums', 'popular', searchQuery, selectedGenre],
    queryFn: () => albumsAPI.list({ limit: 10, search: searchQuery || undefined, genre: selectedGenre || undefined }),
    enabled: mode === 'musique',
    staleTime: 1000 * 60 * 5,
  });

  // 4. Lives (Live mode or overview)
  const { data: livesData, isLoading: isLoadingLives } = useQuery({
    queryKey: ['lives', 'active', searchQuery],
    queryFn: () => livesAPI.list({ search: searchQuery || undefined }),
    enabled: mode === 'live' || mode === 'musique',
    staleTime: 1000 * 60 * 2,
  });

  // 5. Clips (Clips mode or overview)
  const { data: clipsData, isLoading: isLoadingClips } = useQuery({
    queryKey: ['videos', 'clips', searchQuery],
    queryFn: () => videosAPI.list({ type: 'CLIP', limit: 20, search: searchQuery || undefined }),
    enabled: mode === 'clips' || mode === 'musique',
    staleTime: 1000 * 60 * 5,
  });

  const { data: purchasesData } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: async () => {
      const res = await notificationsAPI.list();
      return res.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  });

  const tracks = tracksData?.data?.data || [];
  const lives = livesData?.data?.data || [];
  const artists = artistsData?.data?.data || [];
  const clips = clipsData?.data?.data || [];
  const homeAlbums = homeAlbumsData?.data?.data || [];
  const purchases = purchasesData || [];
  const purchasedTrackIds = useMemo(() => new Set(purchases.filter((p: any) => p.trackId).map((p: any) => p.trackId)), [purchases]);

  const isInitialMusicLoading = mode === 'musique' && isLoadingTracks && tracks.length === 0 && artists.length === 0 && homeAlbums.length === 0;
  const isInitialClipsLoading = mode === 'clips' && isLoadingClips && clips.length === 0;
  const isInitialLivesLoading = mode === 'live' && isLoadingLives && lives.length === 0;
  const isInitialLoading = isInitialMusicLoading || isInitialClipsLoading || isInitialLivesLoading;

  const unreadCount = notificationsData ? notificationsData.filter((n: any) => !n.isRead).length : 0;

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/home_bg.png')}
        style={styles.backgroundImage}
        contentFit="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.70)', '#000000']}
        style={styles.backgroundOverlay}
      />
      <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      {/* Animated Search & Tabs */}
      <Animated.View style={[styles.animatedHeader, { opacity }]}>
        <BlurView intensity={80} tint="dark" style={[styles.blurContainer, { paddingTop: insets.top + 1 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Bonjour</Text>
              <Text style={styles.userName}>{isAuthenticated ? user?.name : 'Visiteur'}</Text>
            </View>
            <View style={styles.headerRight}>
              {isAuthenticated && (
                <TouchableOpacity
                  style={styles.notificationBtn}
                  onPress={() => router.push('/notifications')}
                >
                  <Ionicons name="notifications-outline" size={24} color="#FFF" />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                {isAuthenticated && user?.avatar ? (
                  <Image 
                    source={{ uri: user.avatar }} 
                    style={styles.avatar} 
                    cachePolicy="memory-disk"
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{isAuthenticated && user?.name ? user.name[0].toUpperCase() : 'V'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#A0A0A0" />
            <TextInput
              style={styles.searchInput}
              placeholder={
                mode === 'musique' ? "Rechercher une musique, artiste..." :
                  mode === 'clips' ? "Rechercher un clip..." :
                    "Rechercher un live..."
              }
              placeholderTextColor="#A0A0A0"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.segmentContainer}>
            <TouchableOpacity style={[styles.segmentButton, mode === 'musique' && styles.segmentActive]} onPress={() => setMode('musique')}>
              <Text style={[styles.segmentText, mode === 'musique' && styles.segmentTextActive]}>Musique</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentButton, mode === 'clips' && styles.segmentActive]} onPress={() => setMode('clips')}>
              <Text style={[styles.segmentText, mode === 'clips' && styles.segmentTextActive]}>Clips</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentButton, mode === 'live' && styles.segmentActive]} onPress={() => setMode('live')}>
              <Text style={[styles.segmentText, mode === 'live' && styles.segmentTextActive]}>Live</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </Animated.View>

      {isInitialLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#FF5A00" />
          <Text style={styles.loaderText}>Chargement des nouveautés...</Text>
        </View>
      ) : (
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: HEADER_HEIGHT + insets.top + 30 }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {mode === 'musique' && (
            <>
              {searchQuery === '' && (
                <GenreCarousel
                  selectedGenre={selectedGenre}
                  onSelectGenre={setSelectedGenre}
                />
              )}
              {searchQuery === '' && <LiveSection lives={lives} />}
              <ArtistSection artists={artists} />
              <AlbumSection albums={homeAlbums} />
              <TrackSection tracks={tracks} purchases={purchases} onPlayTrack={(t) => handlePlayTrack(t, tracks)} />
            </>
          )}

          {mode === 'clips' && <ClipList clips={clips} />}

          {mode === 'live' && <LiveFeedList lives={lives} />}
        </Animated.ScrollView>
      )}

      {paymentModalData && (
        <PaymentMethodModal
          visible={!!paymentModalData}
          onClose={() => setPaymentModalData(null)}
          onSelect={(method) => executePayment(method)}
          price={paymentModalData.price}
          currency={paymentModalData.currency}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    transform: [{ scale: 1.15 }, { translateY: 40 }],
  },
  backgroundOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  notificationBtn: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  animatedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  blurContainer: {
    paddingBottom: 10,
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  userName: { fontSize: 26, color: '#FFFFFF', fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FF5A00' },
  avatarFallback: { backgroundColor: '#FF5A00', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  searchInput: { flex: 1, color: '#FFF', marginLeft: 10, fontSize: 15, fontWeight: '500' },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 5,
  },
  segmentButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20 },
  segmentActive: { backgroundColor: '#FF5A00' },
  segmentText: { color: '#A0A0A0', fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: '#FFFFFF' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: '#A0A0A0', marginTop: 12, fontSize: 14 }
});

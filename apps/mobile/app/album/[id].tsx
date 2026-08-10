import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Animated, Easing
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { albumsAPI, tracksAPI, purchasesAPI, userAPI } from '../../src/lib/api';
import { useAuthStore, usePlayerStore, useOfflineStore } from '../../src/stores';
import PaymentMethodModal from '../../src/components/PaymentMethodModal';
import type { Track, Album } from '@kephale/types';

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function PublicAlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const { setTrack, currentTrack, isPlaying, setPlaying, nextTrack, prevTrack } = usePlayerStore();
  const [isProcessingPayment, setIsProcessingPayment] = useState<string | null>(null);
  const [isProcessingAlbumPayment, setIsProcessingAlbumPayment] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<{ type: 'TRACK' | 'ALBUM'; id: string; price: number; currency: string } | null>(null);
  const { downloads, downloading, downloadTrack, removeDownload } = useOfflineStore();

  const rotationValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    if (isPlaying) {
      animation = Animated.loop(
        Animated.timing(rotationValue, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
    } else {
      rotationValue.stopAnimation();
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isPlaying, rotationValue]);

  const spin = rotationValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const { data: albumData, isLoading: isLoadingAlbum } = useQuery({
    queryKey: ['album', id],
    queryFn: () => albumsAPI.getById(id as string),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

  const album: (Album & { isPurchased?: boolean; _count?: { tracks: number; purchases: number } }) | undefined = albumData?.data?.data ?? albumData?.data;

  const { data: purchasesData } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data?.data || [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const purchases = purchasesData || [];
  const purchasedTrackIds = useMemo(() => new Set(purchases.filter((p: any) => p.trackId).map((p: any) => p.trackId)), [purchases]);
  const isAlbumPurchased = useMemo(() => purchases.some((p: any) => p.albumId === id), [purchases, id]);
  const isPurchased = Boolean(album?.isPurchased || isAlbumPurchased);

  const handlePlayTrack = async (track: Track, allTracks: Track[]) => {
    const trackWithAlbumAndArtist = {
      ...track,
      coverUrl: track.coverUrl || album?.coverUrl,
      artist: track.artist || { id: album?.artist?.id || album?.artistId, stageName: album?.artist?.stageName, avatar: album?.artist?.avatar },
    };
    const allTracksWithData = allTracks.map((t) => ({
      ...t,
      coverUrl: t.coverUrl || album?.coverUrl,
      artist: t.artist || { id: album?.artist?.id || album?.artistId, stageName: album?.artist?.stageName, avatar: album?.artist?.avatar },
    }));

    const isUnlocked = track.price === 0 || (album && album.price === 0) || isAlbumPurchased || purchasedTrackIds.has(track.id);
    if (isUnlocked) {
      setTrack(trackWithAlbumAndArtist as any, allTracksWithData as any);
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
        ...trackWithAlbumAndArtist,
        ...(streamUrl ? { audioUrl: streamUrl } : {}),
      };
      setTrack(playableTrack as any, allTracksWithData as any);
    } catch (err: any) {
      if (err.response?.status === 401) {
        Alert.alert('Connexion requise', 'Vous devez être connecté pour écouter ou acheter ce morceau.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
        ]);
      } else if (err.response?.status === 403) {
        Alert.alert(
          'Titre payant',
          `Ce morceau coûte ${track.price} ${track.currency}.`,
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
        Alert.alert('Erreur', 'Impossible de vérifier l\'accès au morceau.');
      }
    }
  };

  const handleBuyAlbum = () => {
    if (!isAuthenticated) {
      Alert.alert('Connexion requise', 'Vous devez être connecté pour acheter cet album.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
      ]);
      return;
    }
    if (album) setPaymentModalData({ type: 'ALBUM', id: album.id, price: album.price, currency: album.currency });
  };

  const executePayment = async (provider: 'TOKEN') => {
    if (!paymentModalData) return;
    const { type, id } = paymentModalData;

    setPaymentModalData(null);
    if (type === 'TRACK') setIsProcessingPayment(id);
    else setIsProcessingAlbumPayment(true);

    try {
      const res = await purchasesAPI.payWithTokens({ type, itemId: id });
      if (res.data?.success) {
        Alert.alert('Succès', 'Achat réussi !');
        checkAuth();
        if (type === 'TRACK' && album?.tracks) {
          const boughtTrack = album.tracks.find(t => t.id === id);
          if (boughtTrack) setTrack(boughtTrack, album.tracks);
        }
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'Erreur lors du paiement');
    } finally {
      setIsProcessingPayment(null);
      setIsProcessingAlbumPayment(false);
    }
  };

  if (isLoadingAlbum) {
    return (
      <View style={[styles.center, { backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#FF5A00" />
      </View>
    );
  }

  if (!album) {
    return (
      <View style={[styles.center, { backgroundColor: '#000' }]}>
        <Text style={{ color: '#FFF' }}>Album introuvable</Text>
      </View>
    );
  }

  const tracks = album.tracks || [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.coverContainer}>
          <Image 
            source={{ uri: album.coverUrl }} 
            style={styles.coverImage} 
            blurRadius={10} 
            cachePolicy="memory-disk"
            contentFit="cover"
          />
          <View style={styles.coverOverlay} />
          
          <SafeAreaView style={styles.safeArea}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.albumMetaContainer}>
              <View style={styles.vinylWrapper}>
                <AnimatedImage 
                  source={{ uri: (currentTrack?.albumId === id && currentTrack?.coverUrl) ? currentTrack.coverUrl : album.coverUrl }} 
                  style={[styles.mainCoverVinyl, { transform: [{ rotate: spin }] }]} 
                  cachePolicy="memory-disk"
                  contentFit="cover"
                />
                <View style={styles.vinylCenterHole} />
              </View>

              <Text style={styles.albumTitle}>{album.title}</Text>
              
              <TouchableOpacity style={styles.artistRow} onPress={() => router.push(`/artist/${album.artistId}` as any)}>
                <Image 
                  source={{ uri: album.artist?.avatar }} 
                  style={styles.artistAvatar} 
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  transition={150}
                />
                <Text style={styles.artistName}>{album.artist?.stageName}</Text>
              </TouchableOpacity>

              {currentTrack?.albumId === id && (
                <View style={styles.miniPlayer}>
                  <TouchableOpacity onPress={prevTrack} style={styles.playerBtn}>
                    <Ionicons name="play-skip-back" size={24} color="#FFF" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => setPlaying(!isPlaying)} style={styles.playerBtnMain}>
                    <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#000" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={nextTrack} style={styles.playerBtn}>
                    <Ionicons name="play-skip-forward" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
              
              <Text style={styles.albumSubInfo}>
                Album • {new Date(album.createdAt).getFullYear()} • {tracks.length} titres
              </Text>
              {album.price > 0 && (
                <Text style={{ color: '#FF5A00', fontSize: 13, marginTop: 4, fontWeight: '600' }}>
                  {album._count?.purchases ?? 0} vente{(album._count?.purchases ?? 0) > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          </SafeAreaView>
        </View>

        {/* Tracks List */}
        <View style={styles.tracksContainer}>
          {album.price > 0 && !isPurchased && (
            <TouchableOpacity 
              style={styles.buyAlbumBtn} 
              onPress={handleBuyAlbum}
              disabled={isProcessingAlbumPayment}
            >
              {isProcessingAlbumPayment ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="cart-outline" size={20} color="#FFF" />
                  <Text style={styles.buyAlbumBtnText}>Acheter l'album complet {album.price} {album.currency}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {(album.price === 0 || isPurchased) && tracks.length > 0 && (
            <TouchableOpacity 
              style={[styles.buyAlbumBtn, { backgroundColor: '#222', borderColor: '#444', borderWidth: 1 }]} 
              onPress={async () => {
                Alert.alert(
                  'Télécharger tout l\'album',
                  `Voulez-vous télécharger les ${tracks.length} morceaux de cet album ?`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Télécharger',
                      onPress: async () => {
                        for (const track of tracks) {
                          try {
                            await downloadTrack(track);
                          } catch (e) {
                            console.warn(`Failed to download track ${track.title}:`, e);
                          }
                        }
                        Alert.alert('Téléchargement lancé', 'Les morceaux de l\'album se téléchargent en arrière-plan.');
                      }
                    }
                  ]
                );
              }}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#FFF" />
              <Text style={styles.buyAlbumBtnText}>Télécharger l'album complet</Text>
            </TouchableOpacity>
          )}

          {tracks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-notes-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>Cet album ne contient aucun morceau pour le moment.</Text>
            </View>
          ) : (
            tracks.map((track, index) => {
              const isTrackUnlocked = track.price === 0 || isPurchased || purchasedTrackIds.has(track.id);
              const isTrackBoughtIndividually = purchasedTrackIds.has(track.id);

              return (
                <TouchableOpacity 
                  key={track.id} 
                  style={styles.trackRow}
                  onPress={() => handlePlayTrack(track, tracks)}
                >
                  <Text style={styles.trackIndex}>{index + 1}</Text>
                  <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle}>{track.title}</Text>
                    <Text style={styles.trackArtist}>{album.artist?.stageName}</Text>
                    {track.price > 0 && (
                      <Text style={{ color: '#A0A0A0', fontSize: 11, marginTop: 2 }}>
                        {track._count?.purchases ?? 0} vente{(track._count?.purchases ?? 0) > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>
                  {!isTrackUnlocked ? (
                    <View style={styles.priceContainer}>
                      {isProcessingPayment === track.id ? (
                        <ActivityIndicator size="small" color="#FF5A00" />
                      ) : (
                        <>
                          <Ionicons name="lock-closed" size={12} color="#FF5A00" />
                          <Text style={styles.trackPrice}>{track.price} {track.currency}</Text>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Offline Download Action */}
                      <View style={{ marginRight: 12 }}>
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
                            <Ionicons name="cloud-done" size={20} color="#10B981" />
                          </TouchableOpacity>
                        ) : downloading[track.id] !== undefined ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <ActivityIndicator size="small" color="#FF5A00" />
                            <Text style={{ color: '#FF5A00', fontSize: 10 }}>{downloading[track.id]}%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => downloadTrack(track)}>
                            <Ionicons name="cloud-download-outline" size={20} color="#A0A0A0" />
                          </TouchableOpacity>
                        )}
                      </View>

                      {isTrackBoughtIndividually && (
                        <View style={styles.purchasedTag}>
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text style={styles.purchasedTagText}>Acheté</Text>
                        </View>
                      )}
                      {isPurchased && track.price > 0 && !isTrackBoughtIndividually && (
                        <Ionicons name="lock-open-outline" size={14} color="#10B981" style={{ marginRight: 8 }} />
                      )}
                      <Ionicons name="ellipsis-vertical" size={16} color="#666" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {paymentModalData && (
        <PaymentMethodModal
          visible={!!paymentModalData}
          onClose={() => setPaymentModalData(null)}
          onSelect={executePayment}
          currency={paymentModalData.currency}
          price={paymentModalData.price}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  coverContainer: {
    minHeight: 460,
    paddingBottom: 20,
    position: 'relative',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    // Gradient effect can be achieved with expo-linear-gradient, using semi-transparent overlay for now
  },
  safeArea: {
    flex: 1,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingTop: 10,
    width: 60,
  },
  albumMetaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 40,
    paddingBottom: 24,
  },
  mainCoverVinyl: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: '#111',
  },
  vinylWrapper: {
    width: 180,
    height: 180,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  vinylCenterHole: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#333',
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    gap: 24,
  },
  playerBtn: {
    padding: 8,
  },
  playerBtnMain: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  artistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  artistAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8, backgroundColor: '#333' },
  artistName: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  albumSubInfo: { color: '#A0A0A0', fontSize: 13 },

  tracksContainer: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  trackIndex: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    width: 30,
    textAlign: 'center',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackTitle: { color: '#FFF', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  trackArtist: { color: '#888', fontSize: 13 },
  
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trackPrice: { color: '#FF5A00', fontSize: 13, fontWeight: '700' },

  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#888', fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 },

  buyAlbumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A00',
    paddingVertical: 14,
    borderRadius: 30,
    marginBottom: 20,
    gap: 8,
  },
  buyAlbumBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  purchasedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
    gap: 4,
  },
  purchasedTagText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
});

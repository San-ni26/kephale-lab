import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  ScrollView, Alert, Dimensions, Share, TextInput, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';
import { videosAPI, purchasesAPI, artistsAPI } from '../../src/lib/api';
import { useAuthStore, useOfflineStore } from '../../src/stores';
import PaymentMethodModal from '../../src/components/PaymentMethodModal';
import AdBanner from '../../src/components/AdBanner';
import { useShouldShowAds } from '../../src/lib/ads';

const { width: SCREEN_W } = Dimensions.get('window');

export default function ClipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, checkAuth } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const { downloads, downloading, downloadVideo, removeDownload } = useOfflineStore();

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');

  const [viewsCount, setViewsCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const entryTimeRef = useRef<number | null>(null);
  const viewRegisteredRef = useRef(false);

  // FIX #4 : garde-fou pour éviter les setState après démontage
  // (changement rapide de clip via setParams, navigation, etc.)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [id]); // reset à chaque changement de clip

  // 1. Fetch Video Details
  const { data: videoData, isLoading: isLoadingVideo, refetch: refetchVideo } = useQuery({
    queryKey: ['video', id],
    queryFn: () => videosAPI.getById(id as string),
    enabled: !!id,
  });

  const video = videoData?.data?.data;

  // FIX #2 : source unique de vérité pour "est-ce que je suis l'artiste ?"
  // Avant : `isSelf` utilisait `user?.artistProfile?.id` mais la logique
  // de stream payant utilisait `user?.artistProfileId` (champ différent).
  // Un artiste qui regardait son propre clip payant pouvait se faire
  // bloquer/facturer par erreur. On calcule une seule fois et on réutilise.
  const myArtistId = user?.artistProfile?.id ?? (user as any)?.artistProfileId ?? null;
  const isSelf = !!video && (myArtistId === video.artistId || video.artist?.userId === user?.id);

  // 3. Fetch Comments
  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['video-comments', id],
    queryFn: () => videosAPI.getComments(id as string),
    enabled: !!id,
  });
  const comments = commentsData?.data?.data || [];

  // 4. Fetch artist's other clips
  const { data: artistClipsData } = useQuery({
    queryKey: ['artist-clips', video?.artistId],
    queryFn: () => artistsAPI.getVideos(video!.artistId, { type: 'CLIP', limit: 10 }),
    enabled: !!video?.artistId,
  });
  const artistClips = artistClipsData?.data?.data?.filter((c: any) => c.id !== id) || [];

  // 5. Fetch Follow Status
  const { data: followStatusData, refetch: refetchFollowStatus } = useQuery({
    queryKey: ['artist-follow-status', video?.artistId, user?.id],
    queryFn: () => artistsAPI.getFollowStatus(video!.artistId),
    enabled: !!video?.artistId && isAuthenticated,
  });

  useEffect(() => {
    if (followStatusData?.data?.data) {
      setIsFollowing(!!followStatusData.data.data.isFollowing);
    }
  }, [followStatusData]);

  useEffect(() => {
    if (video) {
      setLikesCount(video._count?.likes || 0);
      setIsLiked(video.likes?.some((l: any) => l.userId === user?.id) || false);
      setViewsCount(video.views || 0);
      setFollowersCount(video.artist?._count?.followers || 0);
      // Reset registered ref if id changes
      viewRegisteredRef.current = false;
    }
  }, [video, user, id]);

  // FIX #1 : comptage de vues en double.
  // Avant, TROIS chemins pouvaient déclencher un appel `watch()` pour la
  // même session de visionnage :
  //   a) au montage si !hasWatched (ping "vue unique")
  //   b) à la fin de la vidéo (`playToEnd`)
  //   c) au démontage (cleanup, watch partiel)
  // Résultat : un utilisateur qui regarde le clip jusqu'au bout pouvait
  // déclencher 2-3 incréments locaux de `viewsCount` et 2-3 appels serveur
  // pour une seule vue réelle.
  //
  // Correction :
  //  - `viewRegisteredRef` sert maintenant de verrou GLOBAL pour toute la
  //    session de visionnage de ce clip (pas seulement pour le ping initial).
  //  - Le ping "vue unique" au montage ne s'exécute QUE si hasWatched est
  //    faux ET qu'aucune vue n'a déjà été enregistrée dans cette session.
  //  - `playToEnd` et le cleanup au démontage vérifient aussi ce verrou et
  //    ne renvoient PAS un incrément local si le verrou est déjà posé.
  //  - Idéalement, le backend doit aussi être idempotent (un seul
  //    UserVideoView par utilisateur/vidéo) pour se protéger d'une double
  //    requête réseau (retry, double-tap, etc.) — ce correctif côté client
  //    réduit le bruit mais ne remplace pas cette garantie serveur.
  useEffect(() => {
    if (video && isAuthenticated && !video.hasWatched && !viewRegisteredRef.current) {
      viewRegisteredRef.current = true;
      videosAPI.watch(id as string, { watchDurationSec: 0, completed: true })
        .then(() => {
          if (isMountedRef.current) {
            setViewsCount(prev => prev + 1);
          }
        })
        .catch(err => {
          console.warn("Failed to register unique watch view on load:", err);
          // on libère le verrou pour permettre un nouvel essai
          // (ex: à la fin de la vidéo) si le ping initial a échoué
          viewRegisteredRef.current = false;
        });
    }
  }, [video, isAuthenticated, id]);

  // 2. Fetch Stream URL (handles lock logic)
  useEffect(() => {
    if (!video) return;

    // FIX #2 (suite) : utilise myArtistId au lieu de user?.artistProfileId
    if (video.price > 0 && video.artistId !== myArtistId) {
      videosAPI.getStreamUrl(id as string)
        .then(res => {
          if (!isMountedRef.current) return;
          setStreamUrl(res.data.data.streamUrl);
          setIsLocked(false);
        })
        .catch(err => {
          if (!isMountedRef.current) return;
          if (err.response?.status === 403) {
            setIsLocked(true);
          }
        });
    } else {
      setStreamUrl(video.videoUrl);
      setIsLocked(false);
    }
  }, [video, id, myArtistId]);

  const player = useVideoPlayer(streamUrl || '', (p) => {
    p.loop = false;
    p.muted = false;
  });

  // FIX #3 : ne lance la lecture que lorsque le player est réellement prêt
  // (évite le flash/saccade au chargement, et évite d'appeler play() sur
  // un player dont la source n'est pas encore résolue après un changement
  // rapide de clip).
  useEffect(() => {
    if (!player || !streamUrl) return;

    const sub = player.addListener('statusChange', (status: any) => {
      if (status?.status === 'readyToPlay' && isMountedRef.current) {
        player.play();
      }
    });

    return () => {
      sub.remove();
    };
  }, [player, streamUrl]);

  // Track view entry time
  useEffect(() => {
    if (streamUrl && player) {
      entryTimeRef.current = Date.now();
    }
  }, [streamUrl]);

  // Listener to track watch completion when video finishes
  useEffect(() => {
    if (!player || !id) return;

    const sub = player.addListener('playToEnd', () => {
      if (entryTimeRef.current) {
        const watchDurationSec = (Date.now() - entryTimeRef.current) / 1000;
        videosAPI.watch(id as string, { watchDurationSec, completed: true }).catch(() => {});
        // FIX #1 (suite) : n'incrémente localement que si aucune vue n'a
        // déjà été comptée pour cette session (verrou partagé avec le
        // ping de montage ci-dessus).
        if (!viewRegisteredRef.current) {
          viewRegisteredRef.current = true;
          if (isMountedRef.current) setViewsCount(prev => prev + 1);
        }
        entryTimeRef.current = Date.now(); // reset entry time
      }
    });

    return () => {
      sub.remove();
    };
  }, [player, id]);

  // Send watch logs on unmount or before switching video
  useEffect(() => {
    return () => {
      if (entryTimeRef.current && id) {
        const watchDurationSec = (Date.now() - entryTimeRef.current) / 1000;
        // completed: false ici — ce n'est qu'un log de durée partielle,
        // il ne doit JAMAIS incrémenter viewsCount localement (et ne le
        // fait pas : voir FIX #1, seul le ping initial et playToEnd le font).
        videosAPI.watch(id as string, { watchDurationSec, completed: false }).catch(() => {});
        entryTimeRef.current = null;
      }
    };
  }, [id]);

  const handlePurchase = () => {
    if (!isAuthenticated) {
      Alert.alert('Connexion requise', 'Vous devez être connecté pour effectuer un achat.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
      ]);
      return;
    }
    if (!video) return;
    setShowPaymentModal(true);
  };

  const executePayment = async (provider: 'TOKEN') => {
    if (!video) return;
    setShowPaymentModal(false);
    setIsProcessingPayment(true);
    let isSuccess = false;
    try {
      const res = await purchasesAPI.payWithTokens({
        type: 'CLIP',
        itemId: video.id,
      });

      if (res.data?.success) {
        isSuccess = true;
        useAuthStore.getState().updateUser({ tokenBalance: res.data.data.newBalance });
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'Erreur lors du paiement');
      if (isMountedRef.current) setIsProcessingPayment(false);
      return;
    }

    if (isSuccess) {
      Alert.alert('Succès', 'Clip débloqué !');
      try {
        await checkAuth();
        refetchVideo();
      } catch (err) {
        console.log('Error updating data', err);
      }
    }

    if (isMountedRef.current) setIsProcessingPayment(false);
  };

  const handleLike = async () => {
    if (!isAuthenticated) return Alert.alert('Erreur', 'Connectez-vous pour aimer ce clip.');
    try {
      setIsLiked(!isLiked);
      setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
      await videosAPI.like(id as string);
    } catch (err) {
      if (isMountedRef.current) {
        setIsLiked(isLiked);
        setLikesCount(prev => isLiked ? prev + 1 : prev - 1);
      }
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Regarde ce clip : ${video?.title} sur Kephale !`,
      });
    } catch (error) {
      console.log('Erreur de partage', error);
    }
  };

  const handleFollowToggle = async () => {
    if (!isAuthenticated) {
      return Alert.alert('Connexion requise', "Vous devez être connecté pour suivre un artiste.", [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se connecter', onPress: () => router.push('/(auth)/welcome' as any) }
      ]);
    }
    if (!video?.artistId) return;

    const originalIsFollowing = isFollowing;
    try {
      setIsFollowing(!originalIsFollowing);
      setFollowersCount(prev => originalIsFollowing ? Math.max(0, prev - 1) : prev + 1);

      if (originalIsFollowing) {
        await artistsAPI.unfollow(video.artistId);
      } else {
        await artistsAPI.follow(video.artistId);
      }
      refetchFollowStatus();
    } catch (err) {
      if (isMountedRef.current) {
        setIsFollowing(originalIsFollowing);
        setFollowersCount(video.artist?._count?.followers || 0);
        Alert.alert('Erreur', "Impossible de mettre à jour l'abonnement.");
      }
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    if (!isAuthenticated) return Alert.alert('Erreur', 'Connectez-vous pour commenter.');
    try {
      await videosAPI.comment(id as string, commentText);
      if (isMountedRef.current) {
        setCommentText('');
        setShowCommentInput(false);
      }
      Keyboard.dismiss();
      Alert.alert('Succès', 'Commentaire ajouté !');
      refetchVideo();
      refetchComments();
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'ajouter le commentaire.");
    }
  };

  if (isLoadingVideo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5A00" />
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: '#FFF' }}>Clip introuvable.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <StatusBar style="light" />

      {/* HEADER / BACK BUTTON */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Retour"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-down" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* VIDEO PLAYER SECTION (16:9) */}
      <View style={styles.videoContainer}>
        {isLocked ? (
          <View style={styles.lockedContainer}>
            <VideoThumbnail 
              sourceUrl={video.thumbnailUrl}
              videoUrl={video.videoUrl}
              style={styles.lockedThumb} 
              blurRadius={10} 
            />
            <View style={styles.lockedOverlay}>
              <Ionicons name="lock-closed" size={48} color="#FFF" />
              <Text style={styles.lockedTitle}>Clip Exclusif</Text>
              <Text style={styles.lockedDesc}>Achetez ce clip pour le visionner en intégralité.</Text>
              <TouchableOpacity
                style={styles.purchaseBtn}
                onPress={handlePurchase}
                disabled={isProcessingPayment}
              >
                {isProcessingPayment ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.purchaseBtnText}>Débloquer pour {video.price} {video.currency}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : streamUrl ? (
          <VideoView
            player={player}
            style={styles.videoView}
            contentFit="contain"
            nativeControls={true}
            allowsFullscreen={true}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#FF5A00" />
          </View>
        )}
      </View>

      {/* METADATA & COMMENTS SECTION */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.metadataContainer}>
          <Text style={styles.title}>{video.title}</Text>
          <Text style={styles.viewsText}>{viewsCount} vues</Text>

          <View style={styles.artistRow}>
            <TouchableOpacity
              style={styles.artistInfo}
              onPress={() => router.push(`/artist/${video.artistId}`)}
            >
              <Image 
                source={{ uri: video.artist?.avatar || 'https://via.placeholder.com/40' }} 
                style={styles.avatar} 
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
              <View>
                <Text style={styles.artistName}>{video.artist?.stageName}</Text>
                <Text style={styles.artistSub}>{followersCount} abonnés</Text>
              </View>
            </TouchableOpacity>
            {!isSelf && (
              <TouchableOpacity
                style={[styles.subscribeBtn, isFollowing && styles.subscribedBtn]}
                onPress={handleFollowToggle}
              >
                <Text style={[styles.subscribeBtnText, isFollowing && styles.subscribedBtnText]}>
                  {isFollowing ? 'Abonné' : "S'abonner"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ACTIONS SECTION (YouTube style pills) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionRowContainer}
            style={styles.actionRowScroll}
          >
            <TouchableOpacity style={styles.actionPill} onPress={handleLike} accessibilityLabel="Aimer">
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#FF5A00" : "#FFF"} />
              <Text style={styles.actionPillText}>{likesCount}</Text>
            </TouchableOpacity>
            <View style={styles.actionPill}>
              <Ionicons name="chatbubble-outline" size={20} color="#FFF" />
              <Text style={styles.actionPillText}>{video._count?.comments || 0}</Text>
            </View>
            <TouchableOpacity style={styles.actionPill} onPress={handleShare} accessibilityLabel="Partager">
              <Ionicons name="share-social-outline" size={20} color="#FFF" />
              <Text style={styles.actionPillText}>Partager</Text>
            </TouchableOpacity>

            {!isLocked && (
              downloads[video.id] ? (
                <TouchableOpacity
                  style={[styles.actionPill, { borderColor: '#10B981', borderWidth: 1 }]}
                  accessibilityLabel="Supprimer le téléchargement"
                  onPress={() => {
                    Alert.alert(
                      'Supprimer',
                      'Supprimer cette vidéo des fichiers hors ligne ?',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => removeDownload(video.id) }
                      ]
                    );
                  }}
                >
                  <Ionicons name="cloud-done" size={20} color="#10B981" />
                  <Text style={[styles.actionPillText, { color: '#10B981' }]}>Téléchargé</Text>
                </TouchableOpacity>
              ) : downloading[video.id] !== undefined ? (
                <View style={styles.actionPill}>
                  <ActivityIndicator size="small" color="#FF5A00" />
                  <Text style={[styles.actionPillText, { color: '#FF5A00' }]}>{downloading[video.id]}%</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.actionPill} onPress={() => downloadVideo(video)} accessibilityLabel="Télécharger">
                  <Ionicons name="cloud-download-outline" size={20} color="#FFF" />
                  <Text style={styles.actionPillText}>Télécharger</Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>

          {/* Google AdMob Banner for Free accounts */}
          <AdBanner style={{ marginHorizontal: 16 }} />

          {video.description && (
            <View style={styles.descriptionBox}>
              <Text style={styles.descriptionText}>{video.description}</Text>
            </View>
          )}

          {/* AUTRES CLIPS DE L'ARTISTE */}
          {artistClips.length > 0 && (
            <View style={styles.otherClipsSection}>
              <Text style={styles.otherClipsTitle}>Autres clips de cet artiste</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                {artistClips.map((clip: any) => (
                  <TouchableOpacity
                    key={clip.id}
                    style={styles.otherClipCard}
                    onPress={() => router.push(`/clip/${clip.id}` as any)}
                  >
                    <VideoThumbnail 
                      sourceUrl={clip.thumbnailUrl}
                      videoUrl={clip.videoUrl}
                      style={styles.otherClipThumb} 
                    />
                    <View style={styles.otherClipOverlay}>
                      <Ionicons name="play" size={16} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.otherClipTitle} numberOfLines={2}>{clip.title}</Text>
                    <Text style={styles.otherClipViews}>{clip.views} vues</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Commentaires ({video._count?.comments || 0})</Text>
            {comments.length === 0 ? (
              <Text style={styles.noCommentsText}>Aucun commentaire. Soyez le premier !</Text>
            ) : (
              comments.map((c: any) => (
                <View key={c.id} style={styles.commentItem}>
                  <Image 
                    source={{ uri: c.user?.avatar || 'https://via.placeholder.com/40' }} 
                    style={styles.commentAvatar} 
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    transition={150}
                  />
                  <View style={styles.commentContent}>
                    <Text style={styles.commentAuthor}>{c.user?.name || 'Utilisateur'} <Text style={styles.commentDate}>• {new Date(c.createdAt).toLocaleDateString()}</Text></Text>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <View style={[styles.commentFixedBottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.commentFixedInput}
            placeholder="Ajouter un commentaire..."
            placeholderTextColor="#888"
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity
            style={[styles.commentSubmitBtnFixed, !commentText.trim() && { opacity: 0.5 }]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim()}
            accessibilityLabel="Envoyer le commentaire"
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {video && showPaymentModal && (
        <PaymentMethodModal
          visible={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSelect={executePayment}
          currency={video.currency || 'XOF'}
          price={video.price}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    zIndex: 10,
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  videoContainer: {
    width: SCREEN_W,
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    marginTop: 0,
  },
  videoView: {
    flex: 1,
  },
  actionRowScroll: {
    marginBottom: 20,
    marginTop: 8,
  },
  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 16,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  actionPillText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedThumb: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  lockedTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 16,
  },
  lockedDesc: {
    color: '#CCC',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  purchaseBtn: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  purchaseBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  metadataContainer: {
    flex: 1,
    padding: 16,
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  viewsText: {
    color: '#A0A0A0',
    fontSize: 13,
    marginBottom: 16,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
    marginBottom: 16,
  },
  artistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
    marginRight: 12,
  },
  artistName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  artistSub: {
    color: '#A0A0A0',
    fontSize: 12,
    marginTop: 2,
  },
  subscribeBtn: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  subscribeBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  subscribedBtn: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#3F3F3F',
  },
  subscribedBtnText: {
    color: '#FFF',
  },
  descriptionBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  descriptionText: {
    color: '#E0E0E0',
    fontSize: 14,
    lineHeight: 20,
  },
  commentsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 16,
  },
  commentsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  noCommentsText: {
    color: '#888',
    fontSize: 14,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    marginRight: 12,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  commentDate: {
    color: '#888',
    fontWeight: '400',
    fontSize: 12,
  },
  commentText: {
    color: '#E0E0E0',
    fontSize: 14,
    lineHeight: 20,
  },
  commentFixedBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  commentFixedInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 14,
  },
  commentSubmitBtnFixed: {
    marginLeft: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherClipsSection: {
    marginTop: 10,
    marginBottom: 20,
  },
  otherClipsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  otherClipCard: {
    width: 140,
    marginRight: 12,
  },
  otherClipThumb: {
    width: 140,
    height: 80,
    borderRadius: 8,
    marginBottom: 8,
  },
  otherClipOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherClipTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  otherClipViews: {
    color: '#888',
    fontSize: 11,
  }
});

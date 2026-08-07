import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert, Modal, Animated as RNAnimated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation } from '@tanstack/react-query';
import { livesAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/index';
import { getGlobalSocket } from '../../src/lib/socket';

// Vrai LiveKit depuis la librairie native
import { LiveKitRoom, useRoomContext, VideoTrack, useTracks, useLocalParticipant } from '@livekit/react-native';
import { Track } from 'livekit-client';

const FloatingHeart = ({ x, y, onComplete }: { x: number, y: number, onComplete: () => void }) => {
  const translateY = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(1)).current;
  const scale = useRef(new RNAnimated.Value(0.5)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.timing(scale, { toValue: 1.2, duration: 300, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        RNAnimated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true })
      ]),
      RNAnimated.timing(translateY, { toValue: -200, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      RNAnimated.sequence([
        RNAnimated.delay(1000),
        RNAnimated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true })
      ])
    ]).start(() => onComplete());
  }, []);

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 25,
        top: y - 25,
        opacity,
        transform: [{ translateY }, { scale }],
        zIndex: 999,
      }}
    >
      <Ionicons name="heart" size={50} color="rgba(239, 68, 68, 0.9)" />
    </RNAnimated.View>
  );
};

export default function LiveRoomScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [live, setLive] = useState<any>(null);
  const [isArtist, setIsArtist] = useState(false);
  
  const [isCamOn, setIsCamOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  // Initialize the room
  useEffect(() => {
    const initLive = async () => {
      setIsConnecting(true);
      setConnectionError(null);
      try {
        const livesRes = await livesAPI.list();
        const currentLive = livesRes.data?.data?.find((l: any) => l.id === id);
        if (!currentLive) {
          setConnectionError('Live introuvable ou terminé.');
          setIsConnecting(false);
          return;
        }
        setLive(currentLive);
        setViewerCount(currentLive.viewerCount || 0);
        const isHost = currentLive.artist?.id === user?.artistProfile?.id || currentLive.artistId === user?.id;
        setIsArtist(isHost);

        if (isHost && currentLive.status === 'SCHEDULED') {
          // Artist starting the live
          const startRes = await livesAPI.start(id as string);
          setToken(startRes.data.data.liveToken.token);
          setServerUrl(startRes.data.data.liveToken.serverUrl);
        } else if (currentLive.status === 'LIVE') {
          // Viewer joining an active live
          const joinRes = await livesAPI.join(id as string);
          setToken(joinRes.data.data.liveToken?.token || null);
          setServerUrl(joinRes.data.data.liveToken?.serverUrl || null);
        }
        
        if (currentLive.mode === 'AUDIO') {
          setIsCamOn(false);
        }
      } catch (e: any) {
        const msg = e?.response?.data?.error?.message || 'Impossible de rejoindre ce live.';
        setConnectionError(msg);
      } finally {
        setIsConnecting(false);
      }
    };
    if (id && user) {
      initLive();
    }
  }, [id, user]);

  const handleEndLive = async () => {
    Alert.alert('Terminer', 'Voulez-vous vraiment terminer ce live ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui',
        style: 'destructive',
        onPress: async () => {
          try {
            await livesAPI.end(id as string);
            router.back();
          } catch (e) {
            Alert.alert('Erreur', 'Impossible de terminer le live.');
          }
        }
      }
    ]);
  };

  const likeMutation = useMutation({
    mutationFn: () => livesAPI.like(id as string),
    onSuccess: () => {
      if (live) setLive({ ...live, likesCount: (live.likesCount || 0) + 1 });
    }
  });

  const handleDoubleTap = () => {
    likeMutation.mutate();
    // Socket emit possible if we want hearts to be broadcasted to all viewers
  };

  if (isConnecting) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{color: '#FF5A00', fontSize: 16, fontWeight: '700', marginBottom: 8}}>Connexion au live...</Text>
        <Text style={{color: '#888', fontSize: 13}}>Chargement en cours</Text>
      </View>
    );
  }

  if (connectionError || !live) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning-outline" size={48} color="#FF3B30" />
        <Text style={{color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center'}}>{connectionError || 'Live introuvable'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{marginTop: 24, backgroundColor: '#FF5A00', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24}}>
          <Text style={{color: '#FFF', fontWeight: '700'}}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const content = (
    <LiveContent 
      live={live} 
      isArtist={isArtist} 
      isCamOn={isCamOn}
      isMicOn={isMicOn}
      viewerCount={viewerCount}
      setViewerCount={setViewerCount}
      onToggleCam={() => setIsCamOn(!isCamOn)}
      onToggleMic={() => setIsMicOn(!isMicOn)}
      onEndLive={handleEndLive}
      onDoubleTap={handleDoubleTap}
    />
  );

  // If viewer is in a scheduled live, they just wait (no WebRTC connection yet)
  if (live.status === 'SCHEDULED' && !isArtist) {
    return content;
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl!}
      token={token!}
      connect={true}
      audio={isArtist ? isMicOn : false}
      video={isArtist && isCamOn}
      style={styles.container}
    >
      {content}
    </LiveKitRoom>
  );
}

// Inner component that has access to LiveKit context and Socket.IO
function LiveContent({ live, isArtist, isCamOn, isMicOn, viewerCount, setViewerCount, onToggleCam, onToggleMic, onEndLive, onDoubleTap }: any) {
  const room = useRoomContext();
  
  // Remplacer l'ancienne CameraView par les Pistes (Tracks) LiveKit
  const cameraTracks = useTracks([Track.Source.Camera]);
  // Sélectionner la première piste caméra disponible (soit la locale si artiste, soit distante si spectateur)
  const currentCamera = cameraTracks.length > 0 ? cameraTracks[0] : null;

  const [comment, setComment] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [hearts, setHearts] = useState<{ id: string; x: number; y: number }[]>([]);
  
  const [showGifts, setShowGifts] = useState(false);
  const { user } = useAuthStore();

  const GIFTS = [
    { id: 'star', name: 'Étoile', tokens: 10, icon: 'star', color: '#FCD34D' },
    { id: 'flash', name: 'Éclair', tokens: 25, icon: 'flash', color: '#FBBF24' },
    { id: 'heart', name: 'Cœur', tokens: 50, icon: 'heart', color: '#EF4444' },
    { id: 'flower', name: 'Fleur', tokens: 75, icon: 'flower', color: '#EC4899' },
    { id: 'trophy', name: 'Trophée', tokens: 100, icon: 'trophy', color: '#F59E0B' },
    { id: 'diamond', name: 'Diamant', tokens: 200, icon: 'diamond', color: '#3B82F6' },
    { id: 'rocket', name: 'Fusée', tokens: 500, icon: 'rocket', color: '#EF4444' },
    { id: 'crown', name: 'Couronne', tokens: 1000, icon: 'ribbon', color: '#8B5CF6' },
  ];
  
  // Permissions et configuration initiale
  useEffect(() => {
    if (isArtist && isCamOn && !permission?.granted) {
      requestPermission();
    }
  }, [isArtist, isCamOn, permission]);

  // Socket.IO logic for Chat, Gifts, Viewer Count
  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;

    socket.emit('live:join', live.id);

    const handleHistory = (history: any[]) => setMessages(history);
    const handleChat = (msg: any) => setMessages(prev => [msg, ...prev]);
    const handleViewerCount = (data: { count: number }) => setViewerCount(data.count);
    const handleDonation = (donation: any) => {
      // Afficher une alerte ou animation pour le cadeau
      setMessages(prev => [{
        id: donation.id,
        user: { name: 'Système' },
        message: `${donation.fromUser?.name || "Quelqu'un"} a offert un cadeau : ${donation.tokens} jetons ! ${donation.message ? '(' + donation.message + ')' : ''}`,
        createdAt: new Date().toISOString()
      }, ...prev]);
    };

    socket.on('live:chat_history', handleHistory);
    socket.on('live:chat_message', handleChat);
    socket.on('live:viewer_count', handleViewerCount);
    socket.on('live:donation', handleDonation);

    return () => {
      socket.off('live:chat_history', handleHistory);
      socket.off('live:chat_message', handleChat);
      socket.off('live:viewer_count', handleViewerCount);
      socket.off('live:donation', handleDonation);
      socket.emit('live:leave', live.id);
    };
  }, [live.id]);

  const handleSendComment = () => {
    if (!comment.trim()) return;
    const socket = getGlobalSocket();
    if (socket) {
      socket.emit('live:chat', { liveId: live.id, message: comment });
    }
    setComment('');
  };

  const handleGift = async (gift: any) => {
    try {
      await livesAPI.gift(live.id, { tokens: gift.tokens, message: gift.name });
      setShowGifts(false);
      // Mettre à jour le solde de jetons immédiatement
      if (user && typeof user.tokenBalance === 'number') {
        useAuthStore.getState().updateUser({ tokenBalance: user.tokenBalance - gift.tokens });
      }
      // Le socket emit "live:donate" est géré côté backend lors du call REST de l'API. 
      // Mais on peut aussi l'envoyer direct via socket selon l'implémentation backend !
      // En l'occurrence, le controller REST s'occupe de faire l'update et le websocket peut aussi servir.
      const socket = getGlobalSocket();
      if (socket) {
        socket.emit('live:donate', { liveId: live.id, tokens: gift.tokens, message: gift.name });
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.response?.data?.error?.message || "Impossible d'envoyer le cadeau.");
    }
  };

  const requestJoinMutation = useMutation({
    mutationFn: () => livesAPI.requestJoin(live.id),
    onSuccess: () => Alert.alert('Demande envoyée', 'Votre demande pour monter sur scène a été envoyée.'),
    onError: (e: any) => Alert.alert('Erreur', e.response?.data?.error?.message || 'Erreur lors de la demande.')
  });

  const handleTap = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const id = Date.now().toString() + Math.random().toString();
    setHearts(prev => [...prev, { id, x: locationX, y: locationY }]);
    onDoubleTap();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity 
        style={StyleSheet.absoluteFillObject} 
        activeOpacity={1} 
        onPress={handleTap}
      >
        <View style={styles.videoPlaceholder}>
          {live.status === 'SCHEDULED' && !isArtist ? (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="time" size={80} color="#FF5A00" />
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 }}>Ce live est programmé</Text>
              {live.scheduledAt && (
                <Text style={{ color: '#AAA', marginTop: 8 }}>{new Date(live.scheduledAt).toLocaleString('fr-FR')}</Text>
              )}
            </View>
          ) : !isCamOn ? (
            <Ionicons name="mic" size={100} color="#333" />
          ) : currentCamera ? (
            // Vidéo LiveKit connectée au réseau (diffusion P2P/SFU)
            <VideoTrack trackRef={currentCamera} style={StyleSheet.absoluteFillObject} objectFit="cover" />
          ) : (
            <Ionicons name="videocam" size={100} color="#333" />
          )}
        </View>
      </TouchableOpacity>

      {hearts.map(heart => (
        <FloatingHeart 
          key={heart.id} 
          x={heart.x} 
          y={heart.y} 
          onComplete={() => setHearts(prev => prev.filter(h => h.id !== heart.id))}
        />
      ))}

      {/* Header Overlay */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.artistInfo} onPress={() => router.push(`/artist/${live.artistId}`)}>
          <Image 
            source={{ uri: live.artist?.avatar || 'https://via.placeholder.com/40' }} 
            style={styles.avatar} 
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
          />
          <View>
            <Text style={styles.hostName}>{live.artist?.stageName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.viewerCount}>{viewerCount} spec. • {live.likesCount}</Text>
              <Ionicons name="heart" size={11} color="#FF3B30" />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {isArtist ? (
            <>
              {live.mode === 'VIDEO' && (
                <TouchableOpacity style={styles.iconBtn} onPress={onToggleCam}>
                  <Ionicons name={isCamOn ? "videocam" : "videocam-off"} size={22} color="#FFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconBtn} onPress={onToggleMic}>
                <Ionicons name={isMicOn ? "mic" : "mic-off"} size={22} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.endBtn} onPress={onEndLive}>
                <Text style={styles.endBtnText}>Fin</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {live.allowGuests && (
                <TouchableOpacity style={styles.iconBtn} onPress={() => requestJoinMutation.mutate()}>
                  <Ionicons name="hand-left" size={24} color="#FFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Chat Overlay */}
      <KeyboardAvoidingView 
        style={styles.keyboardContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={styles.bottomSection}>
          <FlatList
            data={messages}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            inverted
            contentContainerStyle={{ flexDirection: 'column-reverse' }}
            renderItem={({ item }) => (
              <View style={styles.messageRow}>
                <Text style={styles.messageSender}>{item.user?.name || item.userName || 'Système'}:</Text>
                <Text style={styles.messageText}>{item.message}</Text>
              </View>
            )}
          />

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.commentInput}
                placeholder="Ajouter un commentaire..."
                placeholderTextColor="#DDD"
                value={comment}
                onChangeText={setComment}
                onSubmitEditing={handleSendComment}
              />
              <TouchableOpacity onPress={handleSendComment} style={styles.sendIcon}>
                <Ionicons name="send" size={20} color={comment.trim() ? '#FF5A00' : '#888'} />
              </TouchableOpacity>
            </View>
            {!isArtist && (
              <TouchableOpacity style={styles.giftBtn} onPress={() => setShowGifts(true)}>
                <Ionicons name="gift" size={24} color="#FFD700" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Gifts Modal */}
      <Modal
        visible={showGifts}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGifts(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowGifts(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Envoyer un cadeau</Text>
              <TouchableOpacity onPress={() => setShowGifts(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.giftsGrid}>
              {GIFTS.map((g) => (
                <TouchableOpacity key={g.id} style={styles.giftItem} onPress={() => handleGift(g)}>
                  <Ionicons name={g.icon as any} size={22} color={g.color} style={{ marginBottom: 4 }} />
                  <Text style={styles.giftName}>{g.name}</Text>
                  <Text style={styles.giftTokens}>{g.tokens} jetons</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  artistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingRight: 16,
    borderRadius: 25,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 8 },
  hostName: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  viewerCount: { color: '#ddd', fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  endBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
  },
  endBtnText: { color: '#FFF', fontWeight: '700' },
  keyboardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bottomSection: {
    height: '40%',
    padding: 16,
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  messageSender: { color: '#FFD700', fontWeight: '700', marginRight: 6, fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  messageText: { color: '#FFF', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  commentInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
  },
  sendIcon: {
    padding: 8,
  },
  giftBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  giftsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  giftItem: {
    width: '23%',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
  },
  giftName: { color: '#FFF', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  giftTokens: { color: '#FF5A00', fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
});

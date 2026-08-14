import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image, Modal, Dimensions, FlatList,
  PanResponder, GestureResponderEvent, PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { uploadAPI, videosAPI, tracksAPI, purchasesAPI, userAPI } from '../../src/lib/api';
import { rewriteUrl } from '../../src/lib/url';
import { useAuthStore, usePlayerStore } from '../../src/stores';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { Track } from '@kephale/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';

/**
 * Calcule un hash SHA-256 des premiers 512 Ko du fichier.
 * Utilisé pour une détection instantanée des copies exactes AVANT l'upload.
 * Retourne null en cas d'erreur (le flux normal continue sans blocage).
 */
async function computeFilePrefixHash(uri: string): Promise<string | null> {
  try {
    // Lire les premiers 512 Ko en Base64
    const MAX_BYTES = 512 * 1024;
    const base64Chunk = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: MAX_BYTES,
    });
    // Hacher la représentation Base64 (identifiant déterministe du début du fichier)
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64Chunk,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    );
    return hash;
  } catch {
    return null;
  }
}

const getReachableUrl = (url: string) => {
  return rewriteUrl(url);
};

type AudioRightsStatus = 'ORIGINAL_SOUND' | 'FREE' | 'OWNED_BY_ARTIST' | 'PURCHASED' | 'REQUIRES_PURCHASE';

export default function CreateReelStudioScreen() {
  const queryClient = useQueryClient();
  const { user, checkAuth } = useAuthStore();
  const setPlayingGlobal = usePlayerStore((state) => state.setPlaying);

  // Mettre en pause tout son global de l'application à l'ouverture du studio
  useEffect(() => {
    setPlayingGlobal(false);
  }, [setPlayingGlobal]);

  // Demande proactive des permissions (galerie & caméra) à l'ouverture du Studio
  useEffect(() => {
    (async () => {
      try {
        const { status: libStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (libStatus !== 'granted') {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        }
      } catch (e) {
        console.warn('[Studio] Perm check error:', e);
      }
    })();
  }, []);

  // Protection de l'accès au Studio Reel (Utilisateur connecté obligatoire)
  useEffect(() => {
    if (!user) {
      Alert.alert(
        'Connexion requise',
        'Vous devez être connecté pour utiliser le Studio Reel.',
        [
          { text: 'Se connecter', onPress: () => router.replace('/(auth)/welcome') },
          { text: 'Annuler', onPress: () => router.back(), style: 'cancel' },
        ]
      );
    }
  }, [user]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fichier vidéo principal
  const [videoFile, setVideoFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  // Paramètres de montage (Trim, Volume & Déplacement Audio)
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(600); // 10 min max
  const [audioOffsetSec, setAudioOffsetSec] = useState<number>(0);
  const [audioVolume, setAudioVolume] = useState<number>(1.0);
  const [videoVolume, setVideoVolume] = useState<number>(1.0);
  const [soundInstance, setSoundInstance] = useState<Audio.Sound | null>(null);

  // Timeline state
  const [videoDuration, setVideoDuration] = useState<number>(60);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [timelineThumbnails, setTimelineThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [showVolumePanel, setShowVolumePanel] = useState(false);
  const playheadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<number>(0);

  // Musique sélectionnée & Droits d'auteur
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [originalAudioName, setOriginalAudioName] = useState<string>(`Son original - @${user?.username || 'user'}`);
  const [uploadedS3Data, setUploadedS3Data] = useState<{ s3Key: string; publicUrl: string } | null>(null);
  const [isUploadingPreVideo, setIsUploadingPreVideo] = useState(false);
  const [preUploadProgress, setPreUploadProgress] = useState(0);

  const [rightsInfo, setRightsInfo] = useState<{
    isAuthorized: boolean;
    rightsStatus: AudioRightsStatus;
    tokensRequired: number;
    message: string;
    similarityScore?: number;
    detectionMethod?: string;
    matchedTrack?: {
      id: string;
      title: string;
      artist: { id: string; stageName: string; avatar?: string | null };
      price: number;
    };
  }>({
    isAuthorized: true,
    rightsStatus: 'ORIGINAL_SOUND',
    tokensRequired: 0,
    message: 'Son original autorisé',
  });
  const [isVerifyingRights, setIsVerifyingRights] = useState(false);

  // Modals & recherche audio
  const [isAudioModalVisible, setIsAudioModalVisible] = useState(false);
  const [audioTab, setAudioTab] = useState<'ALL' | 'FREE' | 'MY_PURCHASES' | 'MY_TRACKS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [purchasingTrackId, setPurchasingTrackId] = useState<string | null>(null);

  // Détails publication
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isExplicit, setIsExplicit] = useState(false);

  // Video Player pour l'aperçu du montage
  const player = useVideoPlayer(videoFile?.uri || '', (p) => {
    p.loop = true;
    p.muted = false;
  });

  // ── Génération de vraies vignettes timeline depuis la vidéo ──
  const generateTimelineThumbnails = useCallback(async (uri: string, duration: number) => {
    setIsGeneratingThumbs(true);
    const thumbCount = Math.min(8, Math.max(4, Math.ceil(duration / 10)));
    const interval = duration / thumbCount;
    const thumbs: string[] = [];
    for (let i = 0; i < thumbCount; i++) {
      try {
        const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: Math.round(interval * i * 1000),
          quality: 0.3,
        });
        thumbs.push(thumbUri);
      } catch {
        thumbs.push('');
      }
    }
    setTimelineThumbnails(thumbs);
    setIsGeneratingThumbs(false);
  }, []);

  // ── Playhead sync : lire la position du player et synchroniser l'audio ──
  useEffect(() => {
    if (step !== 2 || !videoFile) return;
    const interval = setInterval(() => {
      try {
        const t = player.currentTime;
        if (typeof t === 'number' && t >= 0) {
          setCurrentTime(t);
        }
      } catch {}
    }, 200);
    playheadIntervalRef.current = interval;
    return () => {
      clearInterval(interval);
      playheadIntervalRef.current = null;
    };
  }, [step, videoFile, player]);

  // ── Sync audio avec vidéo toutes les 2s pour compenser les dérives ──
  useEffect(() => {
    if (!soundInstance || !selectedTrack || !player.playing) return;
    const syncInterval = setInterval(async () => {
      try {
        const videoTime = player.currentTime;
        const expectedAudioPos = (videoTime + audioOffsetSec) * 1000;
        const status = await soundInstance.getStatusAsync();
        if (status.isLoaded && Math.abs(status.positionMillis - expectedAudioPos) > 300) {
          await soundInstance.setPositionAsync(Math.max(0, expectedAudioPos));
        }
      } catch {}
    }, 2000);
    return () => clearInterval(syncInterval);
  }, [soundInstance, selectedTrack, player, audioOffsetSec]);

  // ── Format time helper ──
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Charger / Décharger la piste audio externe (et arrêter l'ancienne instance)
  useEffect(() => {
    let soundObj: Audio.Sound | null = null;
    let isMounted = true;

    async function setupAudio() {
      // Si une instance audio existe déjà, l'arrêter et la décharger pour éviter tout doublon
      if (soundInstance) {
        await soundInstance.stopAsync().catch(() => {});
        await soundInstance.unloadAsync().catch(() => {});
        setSoundInstance(null);
      }

      if (!selectedTrack?.audioUrl) return;

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: selectedTrack.audioUrl },
          {
            positionMillis: audioOffsetSec * 1000,
            shouldPlay: player.playing,
            volume: audioVolume,
          }
        );

        if (isMounted) {
          soundObj = sound;
          setSoundInstance(sound);
        } else {
          await sound.unloadAsync().catch(() => {});
        }
      } catch (err) {
        console.log('Erreur chargement piste audio expo-av:', err);
      }
    }

    setupAudio();

    return () => {
      isMounted = false;
      if (soundObj) {
        soundObj.stopAsync().catch(() => {});
        soundObj.unloadAsync().catch(() => {});
      }
    };
  }, [selectedTrack?.id]);

  // Appliquer les volumes en temps réel
  useEffect(() => {
    if (player) {
      if (selectedTrack) {
        // Musique externe → couper ou réduire le son vidéo selon videoVolume
        player.muted = videoVolume === 0;
        player.volume = videoVolume;
      } else {
        player.muted = false;
        player.volume = videoVolume;
      }
    }
  }, [selectedTrack, player, videoVolume]);

  // Appliquer audioVolume au soundInstance en temps réel
  useEffect(() => {
    if (soundInstance) {
      soundInstance.setVolumeAsync(audioVolume).catch(() => {});
    }
  }, [audioVolume, soundInstance]);

  // Mise à jour en temps réel et instantanée de l'extrait audio (même si la vidéo est en train de jouer)
  const handleLiveOffsetChange = async (newSec: number) => {
    const clamped = Math.max(0, newSec);
    setAudioOffsetSec(clamped);
    if (soundInstance) {
      await soundInstance.setPositionAsync(clamped * 1000).catch(() => {});
    }
  };

  // Synchronisation Lecture / Pause simultanée Vidéo + Audio
  const handleTogglePlayPause = async () => {
    if (player.playing) {
      player.pause();
      if (soundInstance) {
        await soundInstance.pauseAsync().catch(() => {});
      }
    } else {
      // Synchroniser la position audio avec la position vidéo actuelle
      const videoTime = player.currentTime || 0;
      player.play();
      if (soundInstance) {
        const audioPos = Math.max(0, (videoTime + audioOffsetSec)) * 1000;
        await soundInstance.setPositionAsync(audioPos).catch(() => {});
        await soundInstance.playAsync().catch(() => {});
      }
    }
  };

  // ── Vérification des droits d'auteur ──
  // CORRIGÉ: Ne plus déclencher sur title/description (évite les appels API à chaque frappe).
  // Quand selectedTrack est défini, le backend utilise la COUCHE 1 (trackId direct) → pas besoin de S3.
  const verifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (verifyDebounceRef.current) {
      clearTimeout(verifyDebounceRef.current);
    }

    // Si une musique est sélectionnée explicitement, vérification rapide par trackId
    if (selectedTrack?.id) {
      setIsVerifyingRights(true);
      verifyDebounceRef.current = setTimeout(async () => {
        try {
          const res = await videosAPI.verifyAudioRights({
            trackId: selectedTrack.id,
            audioTitle: selectedTrack.title,
          });
          if (isMounted && res.data?.success && res.data?.data) {
            setRightsInfo(res.data.data);
          }
        } catch {
          // ⚠️ CORRECTION BUG 1 : Ne jamais autoriser automatiquement un track connu si la vérif échoue.
          // Si le serveur est indisponible, bloquer la publication par sécurité.
          if (isMounted) {
            setRightsInfo({
              isAuthorized: false,
              rightsStatus: 'REQUIRES_PURCHASE',
              tokensRequired: 0,
              message: 'Vérification des droits impossible (serveur indisponible). Reconnectez-vous ou réessayez avant de publier.',
            });
          }
        } finally {
          if (isMounted) setIsVerifyingRights(false);
        }
      }, 500); // Fast path: 500ms pour les tracks connues
    } else if (uploadedS3Data?.s3Key) {
      // Son original de la vidéo → analyse Chromaprint complète (seulement si pré-upload terminé)
      setIsVerifyingRights(true);
      verifyDebounceRef.current = setTimeout(async () => {
        try {
          const res = await videosAPI.verifyAudioRights({
            originalAudioName: videoFile?.name,
            videoS3Key: uploadedS3Data.s3Key,
            videoUrl: uploadedS3Data.publicUrl,
          });
          if (isMounted && res.data?.success && res.data?.data) {
            setRightsInfo(res.data.data);
          }
        } catch {
          if (isMounted) {
            setRightsInfo({
              isAuthorized: true,
              rightsStatus: 'ORIGINAL_SOUND',
              tokensRequired: 0,
              message: 'Vérification impossible — le serveur vérifiera après publication.',
            });
          }
        } finally {
          if (isMounted) setIsVerifyingRights(false);
        }
      }, 2000); // Slow path: 2s debounce pour l'analyse Chromaprint
    } else {
      // Pas de track ni de S3 key → son original autorisé par défaut
      setIsVerifyingRights(false);
      setRightsInfo({
        isAuthorized: true,
        rightsStatus: 'ORIGINAL_SOUND',
        tokensRequired: 0,
        message: 'Son original autorisé',
      });
    }

    return () => {
      isMounted = false;
      if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current);
    };
  }, [selectedTrack?.id, uploadedS3Data?.s3Key]);

  // Chargement des musiques pour le modal
  const { data: catalogTracksData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['studio-tracks-catalog', searchQuery, audioTab],
    queryFn: async () => {
      const res = await tracksAPI.list({
        search: searchQuery || undefined,
        limit: 30,
      });
      return res.data?.data || [];
    },
    enabled: isAudioModalVisible,
  });

  const catalogTracks: Track[] = catalogTracksData || [];

  const { data: myPurchasesData } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data?.data || [];
    },
    enabled: !!user && isAudioModalVisible,
  });
  const myPurchases = myPurchasesData || [];

  // Filtrer selon l'onglet du sélecteur audio
  const filteredTracks = catalogTracks.filter((t: Track) => {
    if (audioTab === 'FREE') return t.price === 0;
    if (audioTab === 'MY_TRACKS') return user?.artistProfile?.id === t.artistId;
    return true;
  });

  // Traitement et pré-upload immédiat pour l'analyse spectrale instantanée
  const processSelectedVideo = async (asset: DocumentPicker.DocumentPickerAsset) => {
    // Vérification de la taille maximale (limite Supabase Storage 48 Mo)
    try {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (fileInfo.exists && typeof fileInfo.size === 'number') {
        const sizeMb = fileInfo.size / (1024 * 1024);
        if (sizeMb > 48) {
          Alert.alert(
            'Vidéo trop volumineuse',
            `Cette vidéo pèse ${sizeMb.toFixed(1)} Mo. La taille maximale pour un Reel est de 48 Mo.\n\nVeuillez sélectionner une vidéo plus courte (max 60s) ou choisir une qualité standard 720p/1080p.`,
            [{ text: 'Compris' }]
          );
          return;
        }
      }
    } catch {}

    setVideoFile(asset);
    setUploadedS3Data(null);
    if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''));
    setTrimStart(0);
    setTrimEnd(60); // Valeur par défaut 60s
    setStep(2);

    // Générer immédiatement les vraies vignettes extraites de la vidéo pour la timeline
    generateTimelineThumbnails(asset.uri, 60).catch(() => {});

    // Générer immédiatement la miniature (image 0s) par défaut pour assurer que la vidéo ait toujours une image
    VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0, quality: 0.5 })
      .then(({ uri }) => {
        if (uri) setThumbnailUri(uri);
      })
      .catch(() => {});

    // ────────────────────────────────────────────────────────────────────────────
    // PHASE 0 : Détection instantanée par hash SHA-256 (< 200ms)
    // Calcule le hash des premiers 512 Ko et appelle /check-audio-hash en parallèle
    // du pré-upload S3. Bloque immédiatement si le son est une copie exacte connue.
    // ────────────────────────────────────────────────────────────────────────────
    const fileSize = (asset as any).size ?? 0;
    computeFilePrefixHash(asset.uri).then(async (sha256Prefix) => {
      if (!sha256Prefix) return; // Hash impossible → continuer normalement
      try {
        const hashRes = await videosAPI.checkAudioHash({
          sha256Prefix,
          filename: asset.name,
          fileSize,
        });
        const hashData = hashRes.data?.data;
        if (hashData?.isKnown && !hashData?.isAuthorized) {
          // Copie exacte d'un son protégé détectée AVANT l'upload
          setIsVerifyingRights(false);
          setRightsInfo({
            isAuthorized: false,
            rightsStatus: hashData.rightsStatus || 'REQUIRES_PURCHASE',
            tokensRequired: hashData.matchedTrack?.price ? Math.ceil(hashData.matchedTrack.price / 10) : 0,
            message: hashData.message,
            matchedTrack: hashData.matchedTrack,
            detectionMethod: 'FILE_HASH',
          });
        }
        // Si autorisé ou inconnu → le pipeline normal (Chromaprint + AudD) prend le relais
      } catch {
        // Ignorer les erreurs réseau : la vérification complète se fait côté backend
      }
    }).catch(() => {});

    // Déclencher le pré-upload S3 en tâche de fond pour autoriser l'analyse acoustique Chromaprint
    setIsUploadingPreVideo(true);
    setPreUploadProgress(5);
    try {
      const presignedRes = await uploadAPI.getPresignedUrl({
        filename: asset.name,
        contentType: asset.mimeType || 'video/mp4',
        type: 'video',
      });
      const { uploadUrl, publicUrl, key } = presignedRes.data.data;

      const uploadTask = FileSystem.createUploadTask(
        uploadUrl,
        asset.uri,
        {
          httpMethod: 'PUT',
          headers: { 'Content-Type': asset.mimeType || 'video/mp4' },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        },
        (progressData) => {
          if (progressData.totalBytesExpectedToSend > 0) {
            const pct = Math.min(99, Math.round((progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100));
            setPreUploadProgress(pct);
          }
        }
      );

      // Timeout de sécurité (120s) pour ne jamais bloquer l'UI mobile si la connexion réseau est lente
      const uploadPromise = uploadTask.uploadAsync();
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 120000));

      const uploadRes: any = await Promise.race([uploadPromise, timeoutPromise]);

      if (uploadRes && (uploadRes.status === 200 || uploadRes.status === 204)) {
        setUploadedS3Data({ s3Key: key, publicUrl });
      }
    } catch (err) {
      console.warn('[StudioReel] Warning pre-upload vidéo pour analyse spectrale:', err);
    } finally {
      setIsUploadingPreVideo(false);
      setPreUploadProgress(0);
    }
  };

  // Ouvrir la galerie vidéo avec support multi-types
  const pickVideoFromGallery = async () => {
    try {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {}

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],
          allowsEditing: false,
          quality: 0.8,
          videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
        });
      } catch {
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            allowsEditing: false,
            quality: 0.8,
            videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
          });
        } catch {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: false,
            quality: 0.8,
          });
        }
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || asset.uri.split('/').pop() || `reel_${Date.now()}.mp4`;
        processSelectedVideo({
          uri: asset.uri,
          name: fileName,
          mimeType: asset.mimeType || 'video/mp4',
          size: asset.fileSize,
        } as any);
      }
    } catch (err: any) {
      console.error('[Gallery Error]:', err);
      Alert.alert('Erreur Galerie', err?.message || 'Impossible d\'accéder à la galerie vidéo.');
    }
  };

  // Parcourir les fichiers vidéo avec support multi-formats et fallback
  const pickVideoFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/*', 'public.movie', 'public.video', 'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/3gpp', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        processSelectedVideo(asset);
      }
    } catch (err: any) {
      console.error('[Files Error]:', err);
      try {
        const fallbackResult = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (!fallbackResult.canceled && fallbackResult.assets && fallbackResult.assets.length > 0) {
          processSelectedVideo(fallbackResult.assets[0]);
        }
      } catch (fallbackErr: any) {
        Alert.alert('Erreur Fichiers', fallbackErr?.message || 'Impossible d\'accéder aux fichiers.');
      }
    }
  };

  // Enregistrer directement une vidéo avec la caméra
  const recordVideoWithCamera = async () => {
    try {
      try {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) {
          await ImagePicker.requestCameraPermissionsAsync();
        }
      } catch {}

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          allowsEditing: false,
          quality: 0.8,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
          videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
          videoMaxDuration: 180,
        });
      } catch {
        try {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            allowsEditing: false,
            quality: 0.8,
            videoMaxDuration: 180,
          });
        } catch {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: false,
            quality: 0.8,
            videoMaxDuration: 180,
          });
        }
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || asset.uri.split('/').pop() || `camera_${Date.now()}.mp4`;
        processSelectedVideo({
          uri: asset.uri,
          name: fileName,
          mimeType: asset.mimeType || 'video/mp4',
          size: asset.fileSize,
        } as any);
      }
    } catch (err: any) {
      console.error('[Camera Error]:', err);
      Alert.alert('Erreur Caméra', err?.message || 'Impossible d\'ouvrir la caméra.');
    }
  };

  // Sélection de la vidéo avec menu
  const handlePickVideo = () => {
    Alert.alert(
      'Importer une vidéo',
      'Choisissez la source de votre Reel :',
      [
        {
          text: 'Galerie Vidéo',
          onPress: pickVideoFromGallery,
        },
        {
          text: 'Parcourir les Fichiers',
          onPress: pickVideoFromFiles,
        },
        {
          text: 'Filmer avec la Caméra',
          onPress: recordVideoWithCamera,
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  // Sélection miniature
  const handlePickThumbnail = async () => {
    try {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {}

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [9, 16],
          quality: 0.8,
        });
      } catch {
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [9, 16],
            quality: 0.8,
          });
        } catch {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            aspect: [9, 16],
            quality: 0.8,
          });
        }
      }
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setThumbnailUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible de choisir la miniature.');
    }
  };

  // Achat en 1-clic de la musique depuis le studio
  const handleBuyTrack = async (track: Track) => {
    const tokensNeeded = Math.ceil(track.price / 10);
    const userBalance = user?.tokenBalance || 0;

    if (userBalance < tokensNeeded) {
      Alert.alert(
        'Solde insuffisant',
        `Vous avez ${userBalance} Jetons. Il vous faut ${tokensNeeded} Jetons pour utiliser "${track.title}".`,
        [
          { text: 'Plus tard', style: 'cancel' },
          {
            text: 'Recharger',
            onPress: () => router.push('/buy-tokens' as any),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Acheter la musique',
      `Acheter "${track.title}" pour ${tokensNeeded} Jetons et l'utiliser sur votre Reel ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Acheter',
          onPress: async () => {
            setPurchasingTrackId(track.id);
            try {
              const res = await purchasesAPI.payWithTokens({
                type: 'TRACK',
                itemId: track.id,
              });
              if (res.data?.success) {
                await checkAuth().catch(() => {});
                setSelectedTrack(track);
                setIsAudioModalVisible(false);
                queryClient.invalidateQueries({ queryKey: ['my-purchases'] });
                Alert.alert('Succès', `La musique "${track.title}" a été achetée et ajoutée à votre Reel !`);
              }
            } catch (err: any) {
              Alert.alert('Erreur', err?.response?.data?.error?.message || 'Achat échoué');
            } finally {
              setPurchasingTrackId(null);
            }
          },
        },
      ]
    );
  };

  // Publication finale du Reel
  const handlePublishReel = async () => {
    if (!videoFile) return;
    if (!rightsInfo.isAuthorized) {
      Alert.alert(
        'Droits d\'auteur requis',
        rightsInfo.message || 'Veuillez acheter la musique ou choisir un son autorisé avant de publier.'
      );
      return;
    }

    setLoading(true);
    setUploadProgress(5);

    try {
      // 1. Upload miniature (choisie par l'utilisateur ou extraite automatiquement)
      let thumbnailUrl: string | undefined = undefined;
      let effectiveThumb = thumbnailUri;
      if (!effectiveThumb && videoFile?.uri) {
        try {
          const autoRes = await VideoThumbnails.getThumbnailAsync(videoFile.uri, { time: 0, quality: 0.5 });
          if (autoRes?.uri) effectiveThumb = autoRes.uri;
        } catch {}
      }

      if (effectiveThumb) {
        try {
          const thumbPresigned = await uploadAPI.getPresignedUrl({
            filename: 'thumb_reel.jpg',
            contentType: 'image/jpeg',
            type: 'image',
          });
          await FileSystem.uploadAsync(thumbPresigned.data.data.uploadUrl, effectiveThumb, {
            httpMethod: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          });
          thumbnailUrl = thumbPresigned.data.data.publicUrl;
        } catch (e) {
          console.warn('[Studio] Thumbnail upload skipped:', e);
        }
      }
      setUploadProgress(25);

      // 2. Réutiliser le fichier vidéo pré-uploadé ou l'uploader si non disponible
      let finalPublicUrl = uploadedS3Data?.publicUrl;
      let finalS3Key = uploadedS3Data?.s3Key;

      if (!finalPublicUrl || !finalS3Key) {
        const presignedRes = await uploadAPI.getPresignedUrl({
          filename: videoFile.name,
          contentType: videoFile.mimeType || 'video/mp4',
          type: 'video',
        });
        const { uploadUrl: fallbackUploadUrl, publicUrl: fallbackPublicUrl, key: fallbackKey } = presignedRes.data.data;
        setUploadProgress(35);

        const uploadTask = FileSystem.createUploadTask(
          fallbackUploadUrl,
          videoFile.uri,
          {
            httpMethod: 'PUT',
            headers: { 'Content-Type': videoFile.mimeType || 'video/mp4' },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          },
          (progressData) => {
            if (progressData.totalBytesExpectedToSend > 0) {
              const pct = (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100;
              setUploadProgress(Math.round(35 + pct * 0.55));
            }
          }
        );

        const uploadRes = await uploadTask.uploadAsync();
        if (uploadRes?.status !== 200 && uploadRes?.status !== 204) {
          console.error('[StudioReel] Upload S3 failed:', uploadRes?.status, uploadRes?.body);
          if (uploadRes?.status === 413 || uploadRes?.body?.includes('EntityTooLarge')) {
            throw new Error(`La vidéo dépasse la taille maximale autorisée (48 Mo). Veuillez choisir une vidéo plus courte ou compressée en 720p.`);
          }
          throw new Error(`Upload vidéo échoué (erreur ${uploadRes?.status || 'serveur'}). Veuillez réessayer.`);
        }
        finalPublicUrl = fallbackPublicUrl;
        finalS3Key = fallbackKey;
      }

      setUploadProgress(92);

      // 3. Enregistrement en DB via API
      await videosAPI.create({
        title: title.trim() || 'Mon Reel',
        videoUrl: finalPublicUrl,
        s3Key: finalS3Key,
        thumbnailUrl: thumbnailUrl || undefined,
        description: description.trim() || undefined,
        type: 'SHORT',
        duration: Math.round(trimEnd - trimStart) || 15,
        isExplicit,
        // Métadonnées studio TikTok
        audioTrackId: selectedTrack?.id || undefined,
        originalAudioName: selectedTrack ? `${selectedTrack.title} — ${selectedTrack.artist?.stageName || 'Artiste'}` : originalAudioName,
        trimStart,
        trimEnd,
        audioVolume,
        videoVolume,
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });

      Alert.alert('Reel Publié !', 'Votre Reel est en ligne et disponible dans le feed !', [
        { text: 'Voir les Reels', onPress: () => router.replace('/(tabs)/reels') },
      ]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Échec de la publication du Reel.');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Studio Reel</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="lock-closed" size={36} color="#FF5A00" />
          </View>
          <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
            Connexion Requise
          </Text>
          <Text style={{ color: '#999', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24, paddingHorizontal: 20, lineHeight: 20 }}>
            Vous devez être connecté à votre compte Kephale pour utiliser le Studio Reel et publier des vidéos.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#FF5A00', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}
            onPress={() => router.replace('/(auth)/welcome')}
          >
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step > 1 ? setStep(s => (s - 1) as any) : router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Studio Reel</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Badge de Reconnaissance Utilisateur / Artiste */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', gap: 10 }}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={{ width: 32, height: 32, borderRadius: 16 }} />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF5A00', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>{user?.name?.[0] || 'U'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>
              {user?.artistProfile ? user.artistProfile.stageName : user?.name}
            </Text>
            {user?.artistProfile ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF5A00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Ionicons name="star" size={10} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>ARTISTE</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#262626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Ionicons name="person" size={10} color="#AAA" />
                <Text style={{ color: '#AAA', fontSize: 10, fontWeight: '700' }}>UTILISATEUR</Text>
              </View>
            )}
          </View>
          <Text style={{ color: '#777', fontSize: 11 }}>
            {user?.username ? (user.username.startsWith('@') ? user.username : `@${user.username}`) : user?.email}
          </Text>
        </View>
      </View>

      {/* Barre d'étapes */}
      <View style={styles.stepsBar}>
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
              {step > s ? (
                <Ionicons name="checkmark" size={12} color="#FFF" />
              ) : (
                <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
              )}
            </View>
            {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>

      {/* CONTENU SELON L'ÉTAPE */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ÉTAPE 1 : Importation vidéo */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>1. Importer ou capturer une vidéo</Text>

            <TouchableOpacity
              style={[styles.dropZone, videoFile && styles.dropZoneSelected]}
              onPress={handlePickVideo}
              activeOpacity={0.8}
            >
              {videoFile ? (
                <>
                  <Ionicons name="film" size={48} color="#FF5A00" />
                  <Text style={styles.fileName}>{videoFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {videoFile.size ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : 'Vidéo prête'}
                  </Text>
                  <Text style={styles.changeFileText}>Toucher pour remplacer</Text>
                </>
              ) : (
                <>
                  <View style={styles.uploadIconWrap}>
                    <Ionicons name="videocam" size={44} color="#FF5A00" />
                  </View>
                  <Text style={styles.dropTitle}>Sélectionner une vidéo</Text>
                  <Text style={styles.dropSub}>Touchez pour choisir ou utilisez les boutons ci-dessous</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Boutons d'accès direct 1-clic */}
            <View style={styles.quickSourceGrid}>
              <TouchableOpacity
                style={styles.quickSourceCard}
                onPress={pickVideoFromGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.quickSourceIconWrap, { backgroundColor: 'rgba(255, 90, 0, 0.15)' }]}>
                  <Ionicons name="images" size={24} color="#FF5A00" />
                </View>
                <Text style={styles.quickSourceTitle}>Galerie</Text>
                <Text style={styles.quickSourceSub}>Photos & Vidéos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickSourceCard}
                onPress={pickVideoFromFiles}
                activeOpacity={0.7}
              >
                <View style={[styles.quickSourceIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="folder-open" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.quickSourceTitle}>Fichiers</Text>
                <Text style={styles.quickSourceSub}>Stockage & Drive</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickSourceCard}
                onPress={recordVideoWithCamera}
                activeOpacity={0.7}
              >
                <View style={[styles.quickSourceIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="camera" size={24} color="#10B981" />
                </View>
                <Text style={styles.quickSourceTitle}>Caméra</Text>
                <Text style={styles.quickSourceSub}>Filmer en direct</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ÉTAPE 2 : Studio de Montage TikTok/CapCut (Timeline, Trimming, Musique, Volume, Droits) */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.studioHeaderRow}>
              <Text style={styles.sectionTitle}>2. Espace de Montage Studio</Text>
              <View style={styles.durationChip}>
                <Ionicons name="time" size={12} color="#FF5A00" />
                <Text style={styles.durationChipText}>{formatTime(Math.max(1, trimEnd - trimStart))}</Text>
              </View>
            </View>

            {/* Aperçu vidéo au Format Reel 9:16 vertical avec overlay interactif */}
            <View style={styles.reelPreviewContainer}>
              <View style={styles.previewCardReel}>
                {videoFile && (
                  <VideoView
                    player={player}
                    style={styles.previewVideo}
                    contentFit="cover"
                    nativeControls={false}
                  />
                )}

                {/* Overlay Play / Pause */}
                <TouchableOpacity
                  style={styles.playPauseOverlayBtn}
                  onPress={handleTogglePlayPause}
                  activeOpacity={0.7}
                >
                  {!player.playing && (
                    <View style={styles.playIconCircle}>
                      <Ionicons name="play" size={38} color="#FFF" style={{ marginLeft: 4 }} />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Badge temps courant / durée totale */}
                <View style={styles.timecodeBadge}>
                  <Text style={styles.timecodeText}>
                    {formatTime(currentTime)} / {formatTime(Math.max(1, trimEnd - trimStart))}
                  </Text>
                </View>

                {/* Badge Son / Musique appliqué en bas de vidéo */}
                <TouchableOpacity
                  style={styles.soundOverlayChip}
                  onPress={() => setIsAudioModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="musical-notes" size={13} color="#FF5A00" />
                  <Text style={styles.soundOverlayChipText} numberOfLines={1}>
                    {selectedTrack
                      ? `${selectedTrack.title} • ${selectedTrack.artist?.stageName || 'Artiste'}`
                      : 'Son original de la vidéo'}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color="#888" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Barre d'outils de montage rapide */}
            <View style={styles.montageToolbar}>
              <TouchableOpacity
                style={[styles.montageToolBtn, selectedTrack && styles.montageToolBtnActive]}
                onPress={() => setIsAudioModalVisible(true)}
              >
                <Ionicons name="musical-notes" size={18} color={selectedTrack ? '#FF5A00' : '#FFF'} />
                <Text style={[styles.montageToolText, selectedTrack && styles.montageToolTextActive]}>
                  {selectedTrack ? 'Changer Son' : 'Ajouter Son'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.montageToolBtn, showVolumePanel && styles.montageToolBtnActive]}
                onPress={() => setShowVolumePanel(!showVolumePanel)}
              >
                <Ionicons name="volume-medium" size={18} color={showVolumePanel ? '#FF5A00' : '#FFF'} />
                <Text style={[styles.montageToolText, showVolumePanel && styles.montageToolTextActive]}>Volumes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.montageToolBtn}
                onPress={async () => {
                  try {
                    player.currentTime = trimStart;
                    setCurrentTime(trimStart);
                    if (soundInstance) {
                      await soundInstance.setPositionAsync((trimStart + audioOffsetSec) * 1000);
                    }
                  } catch {}
                }}
              >
                <Ionicons name="refresh" size={18} color="#FFF" />
                <Text style={styles.montageToolText}>Début</Text>
              </TouchableOpacity>
            </View>

            {/* PANNEAU DE MIXAGE VOLUMES (Expandable) */}
            {showVolumePanel && (
              <View style={styles.volumeMixerPanel}>
                <View style={styles.volumeMixerHeader}>
                  <Ionicons name="options-outline" size={16} color="#FF5A00" />
                  <Text style={styles.volumeMixerTitle}>Mixage Audio</Text>
                </View>

                {/* Volume Son Vidéo Original */}
                <View style={styles.volumeRowItem}>
                  <View style={styles.volumeLabelCol}>
                    <Text style={styles.volumeTrackName}>Son Vidéo d'origine</Text>
                    <Text style={styles.volumeValueText}>{Math.round(videoVolume * 100)}%</Text>
                  </View>
                  <View style={styles.volumeStepRow}>
                    <TouchableOpacity
                      style={[styles.volChipBtn, videoVolume === 0 && styles.volChipBtnActive]}
                      onPress={() => setVideoVolume(0)}
                    >
                      <Text style={[styles.volChipText, videoVolume === 0 && styles.volChipTextActive]}>Muet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.volChipBtn, videoVolume === 0.5 && styles.volChipBtnActive]}
                      onPress={() => setVideoVolume(0.5)}
                    >
                      <Text style={[styles.volChipText, videoVolume === 0.5 && styles.volChipTextActive]}>50%</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.volChipBtn, videoVolume === 1.0 && styles.volChipBtnActive]}
                      onPress={() => setVideoVolume(1.0)}
                    >
                      <Text style={[styles.volChipText, videoVolume === 1.0 && styles.volChipTextActive]}>100%</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Volume Musique Ajoutée (si sélectionnée) */}
                {selectedTrack && (
                  <View style={styles.volumeRowItem}>
                    <View style={styles.volumeLabelCol}>
                      <Text style={styles.volumeTrackName}>Musique ({selectedTrack.title})</Text>
                      <Text style={styles.volumeValueText}>{Math.round(audioVolume * 100)}%</Text>
                    </View>
                    <View style={styles.volumeStepRow}>
                      <TouchableOpacity
                        style={[styles.volChipBtn, audioVolume === 0 && styles.volChipBtnActive]}
                        onPress={() => setAudioVolume(0)}
                      >
                        <Text style={[styles.volChipText, audioVolume === 0 && styles.volChipTextActive]}>Muet</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.volChipBtn, audioVolume === 0.5 && styles.volChipBtnActive]}
                        onPress={() => setAudioVolume(0.5)}
                      >
                        <Text style={[styles.volChipText, audioVolume === 0.5 && styles.volChipTextActive]}>50%</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.volChipBtn, audioVolume === 1.0 && styles.volChipBtnActive]}
                        onPress={() => setAudioVolume(1.0)}
                      >
                        <Text style={[styles.volChipText, audioVolume === 1.0 && styles.volChipTextActive]}>100%</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* VRAIE TIMELINE DE MONTAGE TIKTOK / CAPCUT (Multi-Pistes avec Vignettes Extraites & Playhead) */}
            <View style={styles.timelineContainer}>
              <View style={styles.timelineHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons name="film" size={16} color="#FF5A00" />
                  <Text style={styles.timelineHeaderTitle}>Timeline Multi-Pistes</Text>
                </View>
                <Text style={styles.timelineTimeIndicator}>
                  {formatTime(currentTime)} / {formatTime(Math.max(1, trimEnd - trimStart))}
                </Text>
              </View>

              {/* RÈGLE TEMPORELLE (Ruler) */}
              <View style={styles.timelineRuler}>
                <Text style={styles.rulerMarker}>0:00</Text>
                <Text style={styles.rulerMarker}>0:15</Text>
                <Text style={styles.rulerMarker}>0:30</Text>
                <Text style={styles.rulerMarker}>0:45</Text>
                <Text style={styles.rulerMarker}>1:00</Text>
                <Text style={styles.rulerMarker}>2:00+</Text>
              </View>

              {/* PISTE 1 : VIDÉO AVEC VRAIES VIGNETTES EXTRAITES & CADRE DE TRIM */}
              <View style={styles.trackCard}>
                <View style={styles.trackCardHeader}>
                  <Ionicons name="videocam" size={15} color="#06B6D4" />
                  <Text style={styles.trackCardTitle}>Piste Vidéo</Text>
                  <Text style={styles.trackDurationText}>{Math.round(trimEnd - trimStart)}s sélectionnées</Text>
                </View>

                {/* Filmstrip avec vraies vignettes extraites de la vidéo */}
                <View style={styles.videoFilmstripContainer}>
                  <View style={styles.videoStripBar}>
                    {timelineThumbnails.length > 0 ? (
                      timelineThumbnails.map((thumbUri, idx) => (
                        <View key={idx} style={styles.videoThumbFrame}>
                          {thumbUri ? (
                            <Image source={{ uri: thumbUri }} style={styles.thumbImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.thumbFallback}>
                              <Ionicons name="film-outline" size={14} color="#555" />
                            </View>
                          )}
                        </View>
                      ))
                    ) : (
                      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <View key={i} style={styles.videoThumbFrame}>
                          <View style={styles.thumbFallback}>
                            <Ionicons name="film-outline" size={14} color="#555" />
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Cadre de Trim Neon CapCut */}
                  <View style={styles.trimSelectionOverlay}>
                    <View style={styles.trimHandleLeft}>
                      <View style={styles.handleGripLine} />
                    </View>
                    <View style={styles.trimSelectionCenter} />
                    <View style={styles.trimHandleRight}>
                      <View style={styles.handleGripLine} />
                    </View>
                  </View>

                  {/* Curseur de lecture animé (Playhead) */}
                  <View
                    style={[
                      styles.playheadLine,
                      {
                        left: `${Math.min(98, Math.max(0, (currentTime / Math.max(1, trimEnd)) * 100))}%`,
                      },
                    ]}
                  >
                    <View style={styles.playheadKnob} />
                  </View>
                </View>

                {/* Réglage du Trimming début / fin (jusqu'à 10 min / 600s) */}
                <View style={styles.trimControlsRow}>
                  <View style={styles.trimBox}>
                    <Text style={styles.trimSubLabel}>Début : {formatTime(trimStart)}</Text>
                    <View style={styles.trimBtnGroup}>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimStart(s => Math.max(0, s - 5))}>
                        <Text style={styles.trimStepText}>-5s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimStart(s => Math.max(0, s - 1))}>
                        <Text style={styles.trimStepText}>-1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimStart(s => Math.min(trimEnd - 2, s + 1))}>
                        <Text style={styles.trimStepText}>+1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimStart(s => Math.min(trimEnd - 5, s + 5))}>
                        <Text style={styles.trimStepText}>+5s</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.trimBox}>
                    <Text style={styles.trimSubLabel}>Fin : {formatTime(trimEnd)}</Text>
                    <View style={styles.trimBtnGroup}>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimEnd(e => Math.max(trimStart + 2, e - 5))}>
                        <Text style={styles.trimStepText}>-5s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimEnd(e => Math.max(trimStart + 1, e - 1))}>
                        <Text style={styles.trimStepText}>-1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimEnd(e => Math.min(600, e + 1))}>
                        <Text style={styles.trimStepText}>+1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.trimStepBtn} onPress={() => setTrimEnd(e => Math.min(600, e + 5))}>
                        <Text style={styles.trimStepText}>+5s</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* PISTE 2 : AUDIO SYNCHRONISÉ (Sélecteur d'Extrait et décalage en temps réel) */}
              <View style={[styles.trackCard, styles.audioTrackCard]}>
                <View style={styles.trackCardHeader}>
                  <Ionicons name="musical-notes" size={16} color="#FF5A00" />
                  <Text style={styles.trackCardTitle}>Piste Audio Musicale</Text>
                  <TouchableOpacity
                    style={styles.changeAudioMiniBtn}
                    onPress={() => setIsAudioModalVisible(true)}
                  >
                    <Text style={styles.changeAudioMiniBtnText}>
                      {selectedTrack ? 'Changer' : '+ Choisir'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.audioTrackName} numberOfLines={1}>
                  {selectedTrack ? `${selectedTrack.title} — ${selectedTrack.artist?.stageName || 'Artiste'}` : 'Son original de la vidéo (Non remplacé)'}
                </Text>

                {selectedTrack ? (
                  <View style={styles.whatsappScrubberContainer}>
                    {/* Badge de plage temporelle de l'extrait audio */}
                    <View style={styles.whatsappBadgeRow}>
                      <Ionicons name="time-outline" size={14} color="#FF5A00" />
                      <Text style={styles.whatsappBadgeText}>
                        Extrait : <Text style={styles.whatsappBadgeHighlight}>{formatTime(audioOffsetSec)} → {formatTime(audioOffsetSec + Math.round(trimEnd - trimStart))}</Text> ({Math.round(trimEnd - trimStart)}s)
                      </Text>
                    </View>

                    {/* Forme d'Onde & Curseur de défilement horizontal */}
                    <View style={styles.whatsappWaveformTrack}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        onScroll={(e) => {
                          const contentOffsetX = e.nativeEvent.contentOffset.x;
                          const calculatedSec = Math.max(0, Math.floor(contentOffsetX / 10));
                          handleLiveOffsetChange(calculatedSec);
                        }}
                        scrollEventThrottle={16}
                        contentContainerStyle={{ paddingHorizontal: 100 }}
                      >
                        <View style={styles.waveformScrollInner}>
                          {[25,50,80,40,90,60,100,70,30,80,50,90,60,40,80,100,70,50,90,30,60,80,100,40,70,90,50,80,60,100,40,70,90,50,80,30,60,90,100,70,40,80,50,90,60,30,100,70,40,80].map((h, idx) => (
                            <View
                              key={idx}
                              style={[
                                styles.waveformBar,
                                { height: `${h}%` },
                                styles.waveformBarActive,
                              ]}
                            />
                          ))}
                        </View>
                      </ScrollView>

                      {/* Cadre de sélection fixe avec poignées */}
                      <View style={styles.whatsappHandleBox} pointerEvents="none">
                        <View style={styles.whatsappHandleLeft} />
                        <View style={styles.whatsappHandleCenterText}>
                          <Ionicons name="musical-notes" size={12} color="#FFF" />
                        </View>
                        <View style={styles.whatsappHandleRight} />
                      </View>
                    </View>

                    {/* Contrôle fin du déplacement de la musique en temps réel */}
                    <View style={styles.audioOffsetBtnRow}>
                      <TouchableOpacity
                        style={styles.offsetStepBtn}
                        onPress={() => handleLiveOffsetChange(Math.max(0, audioOffsetSec - 5))}
                      >
                        <Text style={styles.offsetStepText}>-5s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.offsetStepBtn}
                        onPress={() => handleLiveOffsetChange(Math.max(0, audioOffsetSec - 1))}
                      >
                        <Text style={styles.offsetStepText}>-1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.previewAudioExcerptBtn}
                        onPress={async () => {
                          if (soundInstance) {
                            await soundInstance.setPositionAsync(audioOffsetSec * 1000).catch(() => {});
                            await soundInstance.playAsync().catch(() => {});
                          }
                        }}
                      >
                        <Ionicons name="play" size={13} color="#FFF" />
                        <Text style={styles.previewAudioExcerptText}>Écouter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.offsetStepBtn}
                        onPress={() => handleLiveOffsetChange(audioOffsetSec + 1)}
                      >
                        <Text style={styles.offsetStepText}>+1s</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.offsetStepBtn}
                        onPress={() => handleLiveOffsetChange(audioOffsetSec + 5)}
                      >
                        <Text style={styles.offsetStepText}>+5s</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  /* Forme d'onde par défaut pour son d'origine */
                  <View style={styles.waveformContainer}>
                    {[30, 60, 40, 80, 50, 90, 70, 40, 100, 60, 80, 50, 70, 90, 40, 60, 80, 100, 70, 50, 90, 60, 40, 80, 60, 40, 70, 90].map((h, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.waveformBar,
                          { height: `${h}%` },
                          styles.waveformBarDefault,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* PANNEAU DE SÉCURITÉ AUDIO & DROITS D'AUTEUR */}
            <View style={styles.audioSafetyCard}>
              <View style={styles.safetyCardHeader}>
                <View style={styles.safetyHeaderLeft}>
                  <Ionicons name="shield-checkmark" size={16} color={isUploadingPreVideo ? '#F59E0B' : '#FF5A00'} />
                  <Text style={styles.safetyHeaderTitle} numberOfLines={1}>Sécurité Audio & Droits d'auteur</Text>
                </View>

                <View style={styles.detectionMethodBadge}>
                  {isUploadingPreVideo ? (
                    <View style={styles.scanningBadgeRow}>
                      <ActivityIndicator size="small" color="#F59E0B" />
                      <Text style={[styles.scanningBadgeText, { color: '#F59E0B' }]}>Upload {preUploadProgress}%</Text>
                    </View>
                  ) : isVerifyingRights ? (
                    <View style={styles.scanningBadgeRow}>
                      <ActivityIndicator size="small" color="#FF5A00" />
                      <Text style={styles.scanningBadgeText}>Vérification...</Text>
                    </View>
                  ) : (
                    <Text style={styles.detectionMethodText} numberOfLines={1}>
                      {selectedTrack ? 'Catalogue Kephale' :
                       rightsInfo.detectionMethod === 'CHROMAPRINT' ? 'Spectre Chromaprint' :
                       rightsInfo.detectionMethod === 'ACRCLOUD' ? 'ACRCloud AI' : 'Son Original'}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.rightsResultBox}>
                {/* État : pré-upload en cours (analyse acoustique pas encore lancée) */}
                {isUploadingPreVideo ? (
                  <View style={styles.statusTitleRow}>
                    <Ionicons name="hourglass-outline" size={20} color="#F59E0B" />
                    <Text style={[styles.statusTitleText, { color: '#F59E0B' }]}>
                      Analyse acoustique en cours...
                    </Text>
                  </View>
                ) : isVerifyingRights ? (
                  <View style={styles.statusTitleRow}>
                    <Ionicons name="scan-outline" size={20} color="#FF5A00" />
                    <Text style={[styles.statusTitleText, { color: '#FF5A00' }]}>
                      Vérification des droits en cours...
                    </Text>
                  </View>
                ) : (
                  <View style={styles.statusTitleRow}>
                    <Ionicons
                      name={rightsInfo.isAuthorized ? 'checkmark-circle-sharp' : 'alert-circle-sharp'}
                      size={20}
                      color={rightsInfo.isAuthorized ? '#10B981' : '#EF4444'}
                    />
                    <Text style={[styles.statusTitleText, { color: rightsInfo.isAuthorized ? '#10B981' : '#F87171' }]}>
                      {rightsInfo.isAuthorized
                        ? (selectedTrack ? 'Morceau Autorisé (Catalogue Kephale)' : 'Son Original Autorisé')
                        : 'Droits d\'Auteur Requis'}
                    </Text>
                  </View>
                )}

                <Text style={styles.statusDescriptionText}>
                  {isUploadingPreVideo
                    ? `Téléchargement de la vidéo pour l'analyse (${preUploadProgress}%). L'empreinte acoustique sera vérifiée automatiquement.`
                    : isVerifyingRights
                    ? 'Comparaison avec le catalogue de musiques protégées en cours...'
                    : rightsInfo.message}
                </Text>

                {rightsInfo.matchedTrack && !rightsInfo.isAuthorized && !isVerifyingRights && !isUploadingPreVideo && (
                  <View style={styles.matchedTrackCard}>
                    <View style={styles.matchedTrackIconWrap}>
                      <Ionicons name="musical-notes" size={20} color="#FF5A00" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchedTrackTitle} numberOfLines={1}>
                        {rightsInfo.matchedTrack.title}
                      </Text>
                      <Text style={styles.matchedTrackArtist} numberOfLines={1}>
                        Par {rightsInfo.matchedTrack.artist?.stageName || 'Artiste'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.buyMatchedTrackBtn}
                      onPress={() => handleBuyTrack(rightsInfo.matchedTrack as any)}
                    >
                      <Ionicons name="cart" size={14} color="#FFF" />
                      <Text style={styles.buyMatchedTrackBtnText}>
                        Acheter ({rightsInfo.tokensRequired} J)
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

          </View>
        )}

        {/* ÉTAPE 3 : Détails & Publication */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>3. Détails & Publication</Text>

            {/* Miniature */}
            <Text style={styles.inputLabel}>Miniature personnalisée (optionnel)</Text>
            <TouchableOpacity style={styles.thumbPicker} onPress={handlePickThumbnail}>
              {thumbnailUri ? (
                <Image source={{ uri: thumbnailUri }} style={styles.thumbPreview} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Ionicons name="image-outline" size={32} color="#555" />
                  <Text style={styles.thumbText}>Ajouter une miniature 9:16</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Titre du Reel *</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Mon nouveau freestyle"
              placeholderTextColor="#555"
            />

            <Text style={styles.inputLabel}>Description / Hashtags</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="#music #kephale #senegal..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsExplicit((v) => !v)}
            >
              <Text style={styles.toggleText}>Contenu explicite (+18)</Text>
              <View style={[styles.toggleSwitch, isExplicit && styles.toggleSwitchActive]}>
                <View style={[styles.toggleThumb, isExplicit && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            {loading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>Publication du Reel... {Math.round(uploadProgress)}%</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* BARRE NATIONALE INFÉRIEURE : Boutons de navigation */}
      <View style={styles.footerNav}>
        {step < 3 ? (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              // ⚠️ CORRECTION BUG 3 : Bloquer la navigation si analyse ou upload en cours, ou si droits non autorisés
              (!videoFile || (step === 2 && (isUploadingPreVideo || isVerifyingRights)) || (step === 2 && !rightsInfo.isAuthorized)) && styles.actionBtnDisabled,
            ]}
            onPress={() => {
              // Bloquer si vérification en cours
              if (step === 2 && (isUploadingPreVideo || isVerifyingRights)) {
                Alert.alert(
                  'Analyse en cours',
                  'L\'analyse du son de votre vidéo est en cours. Veuillez patienter avant de continuer.',
                  [{ text: 'OK' }]
                );
                return;
              }
              // Bloquer si droits non autorisés à l'étape 2
              if (step === 2 && !rightsInfo.isAuthorized) {
                Alert.alert(
                  'Droits d\'auteur requis',
                  rightsInfo.message || 'Vous devez acheter ce son ou en choisir un autorisé avant de continuer.',
                  [
                    { text: 'Choisir un autre son', onPress: () => setIsAudioModalVisible(true) },
                    { text: 'Annuler', style: 'cancel' },
                  ]
                );
                return;
              }
              setStep((s) => (s + 1) as any);
            }}
            disabled={!videoFile}
          >
            {step === 2 && (isUploadingPreVideo || isVerifyingRights) ? (
              <>
                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionBtnText}>
                  {isUploadingPreVideo ? `Analyse en cours... ${preUploadProgress}%` : 'Vérification droits...'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.actionBtnText}>Continuer le montage</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.publishBtn, (!title || loading || !rightsInfo.isAuthorized) && styles.actionBtnDisabled]}
            onPress={handlePublishReel}
            disabled={!title || loading || !rightsInfo.isAuthorized}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>Publier le Reel</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL SÉLECTEUR DE MUSIQUE CATALOGUE KEPHALE */}
      <Modal visible={isAudioModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flexShrink: 1, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélecteur de Musique</Text>
              <TouchableOpacity onPress={() => setIsAudioModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Barre de recherche */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#777" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher une musique, un artiste..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Onglets de filtrage */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabsRow, { flexShrink: 0 }]}>
              {[
                { id: 'ALL', label: 'Toutes les musiques' },
                { id: 'FREE', label: 'Gratuites' },
                { id: 'MY_TRACKS', label: 'Mes sons artiste' },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabBtn, audioTab === tab.id && styles.tabBtnActive]}
                  onPress={() => setAudioTab(tab.id as any)}
                >
                  <Text style={[styles.tabText, audioTab === tab.id && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Option Son Original */}
            <TouchableOpacity
              style={[styles.trackItem, !selectedTrack && styles.trackItemActive, { flexShrink: 0 }]}
              onPress={() => {
                setSelectedTrack(null);
                setIsAudioModalVisible(false);
              }}
            >
              <View style={styles.originalAudioIcon}>
                <Ionicons name="mic" size={20} color="#FF5A00" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.trackTitle}>Son Original (Pas de musique)</Text>
                <Text style={styles.trackArtist}>Utiliser la voix / le son de la vidéo</Text>
              </View>
              {!selectedTrack && <Ionicons name="checkmark-circle" size={22} color="#FF5A00" />}
            </TouchableOpacity>

            {/* Liste des musiques */}
            {isCatalogLoading ? (
              <ActivityIndicator color="#FF5A00" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                data={filteredTracks}
                keyExtractor={(item: Track) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }: { item: Track }) => {
                  const isSelected = selectedTrack?.id === item.id;
                  const isPurchased = item.price === 0 || user?.artistProfile?.id === item.artistId || myPurchases.some((p: any) => p.track?.id === item.id || p.itemId === item.id);
                  const tokensNeeded = Math.ceil(item.price / 10);

                  return (
                    <View style={[styles.trackItem, isSelected && styles.trackItemActive]}>
                      {item.coverUrl ? (
                        <Image source={{ uri: item.coverUrl }} style={styles.trackCover} />
                      ) : (
                        <View style={[styles.trackCover, styles.trackCoverFallback]}>
                          <Ionicons name="musical-note" size={18} color="#FFF" />
                        </View>
                      )}

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>{item.artist?.stageName || 'Artiste'}</Text>
                      </View>

                      {isPurchased ? (
                        <TouchableOpacity
                          style={styles.selectTrackBtn}
                          onPress={() => {
                            setSelectedTrack(item);
                            setIsAudioModalVisible(false);
                          }}
                        >
                          <Text style={styles.selectTrackText}>
                            {isSelected ? 'Sélectionné ✓' : 'Utiliser'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.buyTrackBtn}
                          onPress={() => handleBuyTrack(item)}
                          disabled={purchasingTrackId === item.id}
                        >
                          {purchasingTrackId === item.id ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text style={styles.buyTrackText}>Acheter ({tokensNeeded} J)</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  stepsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  stepDot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#1E1E1E', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#333',
  },
  stepDotActive: { backgroundColor: '#FF5A00', borderColor: '#FF5A00' },
  stepNum: { color: '#666', fontSize: 12, fontWeight: '700' },
  stepNumActive: { color: '#FFF' },
  stepLine: { width: 60, height: 2, backgroundColor: '#222', marginHorizontal: 6 },
  stepLineActive: { backgroundColor: '#FF5A00' },

  content: { padding: 16, paddingBottom: 40 },
  stepContainer: { gap: 16 },
  sectionTitle: { color: '#FFF', fontSize: 19, fontWeight: '800', marginBottom: 8 },

  dropZone: {
    borderWidth: 2, borderColor: '#333', borderStyle: 'dashed',
    borderRadius: 20, padding: 36, alignItems: 'center',
    backgroundColor: '#111', marginTop: 10,
  },
  dropZoneSelected: { borderColor: '#FF5A00', backgroundColor: '#1A0E05' },
  uploadIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1C1C1C', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  dropTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  dropSub: { color: '#777', fontSize: 13, textAlign: 'center' },
  fileName: { color: '#FF5A00', fontSize: 15, fontWeight: '700', marginTop: 10 },
  fileSize: { color: '#888', fontSize: 12, marginTop: 2 },
  changeFileText: { color: '#555', fontSize: 12, marginTop: 8 },

  quickSourceGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quickSourceCard: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262626',
  },
  quickSourceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickSourceTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickSourceSub: {
    color: '#777',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },

  studioHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1F1208',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF5A0055',
  },
  durationChipText: { color: '#FF5A00', fontSize: 12, fontWeight: '800' },

  reelPreviewContainer: { alignItems: 'center', marginVertical: 6 },
  previewCardReel: {
    width: 220, height: 360, borderRadius: 20,
    backgroundColor: '#111', overflow: 'hidden', position: 'relative',
    borderWidth: 2, borderColor: '#333',
  },
  previewVideo: { width: '100%', height: '100%' },
  playPauseOverlayBtn: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.12)',
  },
  playIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  timecodeBadge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  timecodeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  soundOverlayChip: {
    position: 'absolute', bottom: 10, left: 8, right: 8,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,90,0,0.4)', gap: 6,
  },
  soundOverlayChipText: { color: '#FFF', fontSize: 11, fontWeight: '700', flex: 1 },

  // BARRE D'OUTILS DE MONTAGE
  montageToolbar: { flexDirection: 'row', gap: 10, marginVertical: 6 },
  montageToolBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161616', paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A2A', gap: 6,
  },
  montageToolBtnActive: { backgroundColor: '#261408', borderColor: '#FF5A00' },
  montageToolText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  montageToolTextActive: { color: '#FF5A00' },

  // PANNEAU DE MIXAGE VOLUMES
  volumeMixerPanel: {
    backgroundColor: '#141414', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#2A2A2A', gap: 10, marginVertical: 4,
  },
  volumeMixerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  volumeMixerTitle: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  volumeRowItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1C1C1C', padding: 10, borderRadius: 10,
  },
  volumeLabelCol: { gap: 2, flex: 1 },
  volumeTrackName: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  volumeValueText: { color: '#FF5A00', fontSize: 11, fontWeight: '800' },
  volumeStepRow: { flexDirection: 'row', gap: 6 },
  volChipBtn: { backgroundColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  volChipBtnActive: { backgroundColor: '#FF5A00' },
  volChipText: { color: '#888', fontSize: 11, fontWeight: '600' },
  volChipTextActive: { color: '#FFF', fontWeight: '800' },

  audioScrubberContainer: { position: 'relative', marginTop: 4 },
  scrubberHintText: { color: '#888', fontSize: 10, textAlign: 'center', marginBottom: 8 },
  waveformScrollInner: { flexDirection: 'row', height: 36, alignItems: 'center', gap: 4, paddingVertical: 4 },

  // WHATSAPP STYLE SELECTOR
  whatsappScrubberContainer: { marginTop: 4, gap: 8 },
  whatsappBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  whatsappBadgeText: { color: '#AAA', fontSize: 12 },
  whatsappBadgeHighlight: { color: '#FF5A00', fontWeight: '800' },
  whatsappWaveformTrack: { position: 'relative', height: 48, backgroundColor: '#0E1711', borderRadius: 10, justifyContent: 'center' },
  whatsappHandleBox: {
    position: 'absolute', top: 0, bottom: 0, left: '25%', right: '25%',
    borderWidth: 2.5, borderColor: '#FF5A00', borderRadius: 8,
    backgroundColor: 'rgba(255, 90, 0, 0.18)', flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2,
  },
  whatsappHandleLeft: { width: 5, height: '60%', backgroundColor: '#FF5A00', borderRadius: 3 },
  whatsappHandleRight: { width: 5, height: '60%', backgroundColor: '#FF5A00', borderRadius: 3 },
  whatsappHandleCenterText: { flex: 1, alignItems: 'center' },

  previewAudioExcerptBtn: {
    flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF5A00', paddingVertical: 6, borderRadius: 6, gap: 4,
  },
  previewAudioExcerptText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  audioWindowOverlayBox: {
    position: 'absolute', top: 22, left: '25%', right: '25%', height: 38,
    borderWidth: 2, borderColor: '#FF5A00', borderRadius: 8,
    backgroundColor: 'rgba(255, 90, 0, 0.15)', justifyContent: 'center', alignItems: 'center',
  },
  audioWindowText: { color: '#FFF', fontSize: 9, fontWeight: '800', backgroundColor: '#FF5A00', paddingHorizontal: 6, borderRadius: 4 },

  // PANNEAU SÉCURITÉ AUDIO & DROITS D'AUTEUR CHROMAPRINT™
  audioSafetyCard: {
    backgroundColor: '#121212', borderRadius: 14, padding: 12,
    borderWidth: 1.5, borderColor: '#262626', marginVertical: 4, gap: 8,
    width: '100%', overflow: 'hidden',
  },
  safetyCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#222',
    gap: 8, width: '100%',
  },
  safetyHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flex: 1, flexShrink: 1, marginRight: 4,
  },
  safetyHeaderTitle: { color: '#FFF', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  detectionMethodBadge: {
    backgroundColor: '#1F1F1F', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: '#333', flexShrink: 0,
  },
  detectionMethodText: { color: '#FF5A00', fontSize: 10, fontWeight: '800' },
  scanningBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanningBadgeText: { color: '#AAA', fontSize: 10, fontWeight: '700' },
  scanningContentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, width: '100%' },
  pulsingWaveContainer: { flexDirection: 'row', height: 18, alignItems: 'center', gap: 2.5, flexShrink: 0 },
  pulsingWaveBar: { width: 2.5, backgroundColor: '#FF5A00', borderRadius: 2 },
  scanningMessageText: { color: '#AAA', fontSize: 11, flex: 1, flexShrink: 1, lineHeight: 15 },
  rightsResultBox: { gap: 6, width: '100%' },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  statusTitleText: { fontSize: 13, fontWeight: '800', flex: 1, flexShrink: 1 },
  statusDescriptionText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 15 },
  matchedTrackCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A120B',
    padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#FF5A0055', gap: 8, marginTop: 4, width: '100%',
  },
  matchedTrackIconWrap: {
    width: 32, height: 32, borderRadius: 6, backgroundColor: '#26180D',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  matchedTrackTitle: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  matchedTrackArtist: { color: '#AAA', fontSize: 10, marginTop: 1 },
  matchedTrackScoreText: { color: '#FF5A00', fontSize: 9, fontWeight: '700', marginTop: 2 },
  buyMatchedTrackBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF5A00',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4, flexShrink: 0,
  },
  buyMatchedTrackBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // STYLES TIMELINE BI-PISTES TIKTOK / CAPCUT
  timelineContainer: {
    backgroundColor: '#121212', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#222', gap: 12,
  },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  timelineHeaderTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  timelineTimeIndicator: { color: '#FF5A00', fontSize: 12, fontWeight: '800' },

  timelineRuler: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 2,
  },
  rulerMarker: { color: '#555', fontSize: 9, fontWeight: '700' },

  trackCard: {
    backgroundColor: '#1A1A1A', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  audioTrackCard: { borderColor: '#FF5A0055', backgroundColor: '#1A120B' },
  trackCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  trackCardTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', flex: 1 },
  trackDurationText: { color: '#06B6D4', fontSize: 12, fontWeight: '700' },

  videoFilmstripContainer: {
    position: 'relative', height: 48, borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#0E1726', marginVertical: 6,
  },
  videoStripBar: {
    flexDirection: 'row', width: '100%', height: '100%',
    padding: 2, gap: 2,
  },
  videoThumbFrame: {
    flex: 1, height: '100%', backgroundColor: '#1E293B',
    borderRadius: 4, overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E293B' },

  trimSelectionOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    borderWidth: 2, borderColor: '#FFCC00', borderRadius: 6,
    flexDirection: 'row', justifyContent: 'space-between', pointerEvents: 'none',
  },
  trimHandleLeft: {
    width: 10, height: '100%', backgroundColor: '#FFCC00',
    justifyContent: 'center', alignItems: 'center',
    borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
  },
  trimHandleRight: {
    width: 10, height: '100%', backgroundColor: '#FFCC00',
    justifyContent: 'center', alignItems: 'center',
    borderTopRightRadius: 4, borderBottomRightRadius: 4,
  },
  handleGripLine: { width: 2, height: 16, backgroundColor: '#000', borderRadius: 1 },
  trimSelectionCenter: { flex: 1, backgroundColor: 'rgba(255, 204, 0, 0.08)' },

  playheadLine: {
    position: 'absolute', top: -4, bottom: -4, width: 2.5,
    backgroundColor: '#FFF', zIndex: 10, alignItems: 'center',
  },
  playheadKnob: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5A00',
    position: 'absolute', top: -3, borderWidth: 1, borderColor: '#FFF',
  },

  changeAudioMiniBtn: {
    backgroundColor: '#FF5A0022', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: '#FF5A00',
  },
  changeAudioMiniBtnText: { color: '#FF5A00', fontSize: 11, fontWeight: '700' },

  audioTrackName: { color: '#FF5A00', fontSize: 13, fontWeight: '700', marginBottom: 8 },

  waveformContainer: {
    flexDirection: 'row', height: 28, alignItems: 'center', gap: 3,
    backgroundColor: '#26180D', paddingHorizontal: 8, borderRadius: 6, marginBottom: 10,
  },
  waveformBar: { flex: 1, borderRadius: 2 },
  waveformBarActive: { backgroundColor: '#FF5A00' },
  waveformBarDefault: { backgroundColor: '#666' },

  audioOffsetSection: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderColor: '#2E1E14' },
  audioOffsetLabel: { color: '#AAA', fontSize: 11, fontWeight: '600', marginBottom: 6 },
  audioOffsetBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offsetStepBtn: {
    backgroundColor: '#2A1A10', paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 6, borderWidth: 1, borderColor: '#FF5A0044',
  },
  offsetStepText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  offsetValueBadge: {
    flex: 1, alignItems: 'center', backgroundColor: '#120B07',
    paddingVertical: 6, borderRadius: 6,
  },
  offsetValueText: { color: '#FF5A00', fontSize: 11, fontWeight: '700' },

  montageSection: {
    backgroundColor: '#141414', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#222',
  },
  montageLabel: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durationBadge: { color: '#FF5A00', fontSize: 13, fontWeight: '700' },

  audioSelectorBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1F1F1F', padding: 12, borderRadius: 10,
  },
  audioSelectorText: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 },

  trimControlsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  trimBox: { flex: 1, backgroundColor: '#1A1A1A', padding: 10, borderRadius: 10 },
  trimSubLabel: { color: '#AAA', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  trimBtnGroup: { flexDirection: 'row', gap: 8 },
  trimStepBtn: {
    flex: 1, backgroundColor: '#2B2B2B', paddingVertical: 6,
    borderRadius: 6, alignItems: 'center',
  },
  trimStepText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  volumeRow: { marginTop: 10 },
  volumeLabel: { color: '#AAA', fontSize: 12, marginBottom: 6 },
  volumeBtns: { flexDirection: 'row', gap: 6 },
  volBtn: {
    flex: 1, backgroundColor: '#1F1F1F', paddingVertical: 6,
    borderRadius: 6, alignItems: 'center',
  },
  volBtnActive: { backgroundColor: '#FF5A00' },
  volBtnText: { color: '#777', fontSize: 11, fontWeight: '600' },
  volBtnTextActive: { color: '#FFF', fontWeight: '700' },

  inputLabel: { color: '#CCC', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  textInput: {
    backgroundColor: '#141414', borderRadius: 12, padding: 14,
    color: '#FFF', fontSize: 15, borderWidth: 1, borderColor: '#262626',
  },
  textArea: { height: 74, textAlignVertical: 'top' },

  thumbPicker: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  thumbPreview: { width: '100%', height: 160, borderRadius: 12 },
  thumbPlaceholder: {
    height: 100, backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#262626', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  thumbText: { color: '#777', fontSize: 13, marginTop: 6 },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#141414', padding: 14, borderRadius: 12,
  },
  toggleText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#333', padding: 2 },
  toggleSwitchActive: { backgroundColor: '#FF5A00' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#777' },
  toggleThumbActive: { backgroundColor: '#FFF', transform: [{ translateX: 20 }] },

  progressContainer: { marginTop: 12 },
  progressBar: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FF5A00' },
  progressText: { color: '#AAA', fontSize: 12, textAlign: 'center', marginTop: 6 },

  footerNav: { padding: 16, borderTopWidth: 1, borderColor: '#1A1A1A' },
  actionBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FF5A00', borderRadius: 14, paddingVertical: 15, gap: 8,
  },
  publishBtn: { backgroundColor: '#10B981' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // MODAL SÉLECTEUR AUDIO
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1F1F1F', borderRadius: 10, paddingHorizontal: 12, marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 8, color: '#FFF', fontSize: 14 },

  tabsRow: { flexDirection: 'row', marginBottom: 14 },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#1F1F1F', marginRight: 8,
  },
  tabBtnActive: { backgroundColor: '#FF5A00' },
  tabText: { color: '#888', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#FFF', fontWeight: '700' },

  originalAudioIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F1F1F',
    justifyContent: 'center', alignItems: 'center',
  },
  trackItem: {
    flexDirection: 'row', alignItems: 'center', padding: 10,
    borderRadius: 12, backgroundColor: '#1A1A1A', marginBottom: 8,
  },
  trackItemActive: { borderWidth: 1, borderColor: '#FF5A00' },
  trackCover: { width: 40, height: 40, borderRadius: 6 },
  trackCoverFallback: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  trackTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  trackArtist: { color: '#888', fontSize: 12, marginTop: 2 },

  selectTrackBtn: { backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  selectTrackText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  buyTrackBtn: { backgroundColor: '#FF5A00', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  buyTrackText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});

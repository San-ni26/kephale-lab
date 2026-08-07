import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { uploadAPI, videosAPI } from '../../src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { requestMediaLibraryPermission, requestCameraPermission } from '../../src/lib/permissions';

type VideoType = 'CLIP' | 'SHORT';

export default function UploadVideoScreen() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [videoFile, setVideoFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [autoThumbnailUri, setAutoThumbnailUri] = useState<string | null>(null);
  const [type, setType] = useState<VideoType>('CLIP');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [isExplicit, setIsExplicit] = useState(false);

  const extractAutoThumbnail = async (uri: string) => {
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 1000,
        quality: 0.75,
      });
      if (thumbUri) {
        setAutoThumbnailUri(thumbUri);
      }
    } catch (e) {
      console.warn('[AutoThumbnail] Extraction échouée:', e);
    }
  };

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
        const fileName = asset.fileName || asset.uri.split('/').pop() || `video_${Date.now()}.mp4`;
        setVideoFile({
          uri: asset.uri,
          name: fileName,
          mimeType: asset.mimeType || 'video/mp4',
          size: asset.fileSize,
        } as any);
        if (!title) setTitle(fileName.replace(/\.[^.]+$/, ''));
        extractAutoThumbnail(asset.uri);
      }
    } catch (err: any) {
      console.error('[Gallery Pick Error]:', err);
      Alert.alert('Erreur Galerie', err?.message || 'Impossible d\'ouvrir la galerie vidéo.');
    }
  };

  const pickVideoFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['video/*', 'public.movie', 'public.video', 'video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/3gpp', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setVideoFile(asset);
        if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''));
        extractAutoThumbnail(asset.uri);
      }
    } catch (err: any) {
      try {
        const fallback = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (!fallback.canceled && fallback.assets && fallback.assets.length > 0) {
          const asset = fallback.assets[0];
          setVideoFile(asset);
          if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''));
          extractAutoThumbnail(asset.uri);
        }
      } catch (fallbackErr: any) {
        console.error('[Files Pick Error]:', fallbackErr);
        Alert.alert('Erreur Fichiers', fallbackErr?.message || 'Impossible de sélectionner le fichier vidéo.');
      }
    }
  };

  const pickVideoFromCamera = async () => {
    try {
      try {
        await ImagePicker.requestCameraPermissionsAsync();
      } catch {}

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          allowsEditing: false,
          quality: 0.8,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
          videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
          videoMaxDuration: 300,
        });
      } catch {
        try {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            allowsEditing: false,
            quality: 0.8,
            videoMaxDuration: 300,
          });
        } catch {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: false,
            quality: 0.8,
            videoMaxDuration: 300,
          });
        }
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || asset.uri.split('/').pop() || `camera_${Date.now()}.mp4`;
        setVideoFile({
          uri: asset.uri,
          name: fileName,
          mimeType: asset.mimeType || 'video/mp4',
          size: asset.fileSize,
        } as any);
        if (!title) setTitle(fileName.replace(/\.[^.]+$/, ''));
        extractAutoThumbnail(asset.uri);
      }
    } catch (err: any) {
      console.error('[Camera Pick Error]:', err);
      Alert.alert('Erreur Caméra', err?.message || 'Impossible d\'accéder à la caméra.');
    }
  };

  const handlePickVideo = () => {
    Alert.alert(
      'Ajouter une vidéo',
      'Choisissez la source de votre vidéo :',
      [
        {
          text: 'Galerie Vidéos',
          onPress: pickVideoFromGallery,
        },
        {
          text: 'Caméra / Enregistrer',
          onPress: pickVideoFromCamera,
        },
        {
          text: 'Fichiers & Documents',
          onPress: pickVideoFromFiles,
        },
        { text: 'Annuler', style: 'cancel' }
      ]
    );
  };

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
          aspect: [16, 9],
          quality: 0.8,
        });
      } catch {
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });
        } catch {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });
        }
      }
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setThumbnailUri(result.assets[0].uri);
      }
    } catch (err: any) {
      console.error('[Thumbnail Pick Error]:', err);
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la galerie photo.');
    }
  };

  const handleUpload = async () => {
    if (!videoFile) return;
    setLoading(true);
    setUploadProgress(5);

    try {
      // 1. Upload thumbnail (custom or auto-extracted)
      let thumbnailUrl: string | undefined = undefined;
      const finalThumbnailUri = thumbnailUri || autoThumbnailUri;
      if (finalThumbnailUri) {
        const thumbPresigned = await uploadAPI.getPresignedUrl({
          filename: 'thumb.jpg',
          contentType: 'image/jpeg',
          type: 'image',
        });
        await FileSystem.uploadAsync(thumbPresigned.data.data.uploadUrl, finalThumbnailUri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });
        thumbnailUrl = thumbPresigned.data.data.publicUrl;
      }
      setUploadProgress(25);

      // 2. Get presigned URL for video
      const presignedRes = await uploadAPI.getPresignedUrl({
        filename: videoFile.name,
        contentType: videoFile.mimeType || 'video/mp4',
        type: 'video',
      });
      const { uploadUrl, publicUrl, key } = presignedRes.data.data;
      setUploadProgress(35);

      // 3. Upload video file
      const uploadTask = FileSystem.createUploadTask(
        uploadUrl,
        videoFile.uri,
        {
          httpMethod: 'PUT',
          headers: { 'Content-Type': videoFile.mimeType || 'video/mp4' },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        },
        (progressData) => {
          const pct = (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100;
          setUploadProgress(35 + pct * 0.55);
        }
      );

      const uploadRes = await uploadTask.uploadAsync();
      if (uploadRes?.status !== 200 && uploadRes?.status !== 204) {
        throw new Error(`Upload échoué (${uploadRes?.status}): ${uploadRes?.body}`);
      }
      setUploadProgress(92);

      // 4. Create video record
      await videosAPI.create({
        title: title.trim() || videoFile.name,
        videoUrl: publicUrl,
        s3Key: key,
        thumbnailUrl,
        description: description.trim() || undefined,
        type,
        price: parseFloat(price) || 0,
        currency: 'XOF',
        isExplicit,
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });

      Alert.alert('Vidéo publiée !', 'Votre vidéo est en cours de traitement et sera disponible bientôt.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'L\'upload a échoué. Veuillez réessayer.');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step > 1 ? setStep(s => s - 1) : router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publier une vidéo</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.steps}>
        {[1, 2].map((s) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
              {step > s
                ? <Ionicons name="checkmark" size={12} color="#FFF" />
                : <Text style={styles.stepDotText}>{s}</Text>
              }
            </View>
            {s < 2 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 1 — Type + File */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Type de contenu</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeCard, type === 'CLIP' && styles.typeCardActive]}
                onPress={() => setType('CLIP')}
              >
                <Ionicons name="film-outline" size={30} color={type === 'CLIP' ? '#06B6D4' : '#888'} style={{ marginBottom: 6 }} />
                <Text style={[styles.typeLabel, type === 'CLIP' && styles.typeLabelActive]}>Clip officiel</Text>
                <Text style={styles.typeDesc}>Clip musical complet sur votre page artiste</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeCard, type === 'SHORT' && styles.typeCardActive]}
                onPress={() => router.push('/studio/create-reel' as any)}
              >
                <Ionicons name="flash-outline" size={30} color={type === 'SHORT' ? '#FF5A00' : '#888'} style={{ marginBottom: 6 }} />
                <Text style={[styles.typeLabel, type === 'SHORT' && styles.typeLabelActive]}>Reel (Studio de montage)</Text>
                <Text style={styles.typeDesc}>Vidéo courte avec trimming, musique & droits audio</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.stepTitle}>Fichier vidéo</Text>
            <TouchableOpacity
              style={[styles.dropZone, videoFile && styles.dropZoneSelected]}
              onPress={handlePickVideo}
            >
              {videoFile ? (
                <>
                  <Ionicons name="film" size={40} color="#06B6D4" />
                  <Text style={styles.fileName} numberOfLines={1}>{videoFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {videoFile.size ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB` : ''}
                  </Text>
                  <Text style={styles.changeText}>Toucher pour changer</Text>
                </>
              ) : (
                <>
                  <View style={styles.uploadIconWrap}>
                    <Ionicons name="cloud-upload-outline" size={48} color="#555" />
                  </View>
                  <Text style={styles.dropTitle}>Sélectionner une vidéo</Text>
                  <Text style={styles.dropSubtitle}>MP4, MOV · jusqu'à 2 GB</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Quick Action Picker Buttons */}
            <View style={styles.quickPickRow}>
              <TouchableOpacity style={styles.quickPickBtn} onPress={pickVideoFromGallery}>
                <Ionicons name="images-outline" size={20} color="#06B6D4" />
                <Text style={styles.quickPickText}>Galerie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickPickBtn} onPress={pickVideoFromFiles}>
                <Ionicons name="folder-open-outline" size={20} color="#06B6D4" />
                <Text style={styles.quickPickText}>Fichiers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickPickBtn} onPress={pickVideoFromCamera}>
                <Ionicons name="videocam-outline" size={20} color="#06B6D4" />
                <Text style={styles.quickPickText}>Caméra</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2 — Metadata + Confirm */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Détails de la vidéo</Text>

            {/* Thumbnail */}
            <Text style={styles.label}>Miniature (optionnel)</Text>
            <TouchableOpacity style={styles.thumbPicker} onPress={handlePickThumbnail}>
              {thumbnailUri ? (
                <Image source={{ uri: thumbnailUri }} style={styles.thumbPreview} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Ionicons name="image-outline" size={32} color="#444" />
                  <Text style={styles.thumbPlaceholderText}>Ajouter une miniature</Text>
                  <Text style={styles.thumbPlaceholderSub}>Format 16:9 recommandé</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Titre *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Titre de la vidéo"
              placeholderTextColor="#555"
            />

            <Text style={styles.label}>Description (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description, liens..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {type === 'CLIP' && (
              <>
                <Text style={styles.label}>Prix (XOF) — 0 = Gratuit</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#555"
                />
              </>
            )}

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsExplicit((v) => !v)}
            >
              <Text style={styles.toggleLabel}>Contenu explicite</Text>
              <View style={[styles.toggle, isExplicit && styles.toggleActive]}>
                <View style={[styles.toggleThumb, isExplicit && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            {loading && (
              <View style={styles.uploadProgress}>
                <View style={styles.uploadProgressBar}>
                  <View style={[styles.uploadProgressFill, { width: `${uploadProgress}%` }]} />
                </View>
                <Text style={styles.uploadProgressText}>{Math.round(uploadProgress)}% uploadé...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step < 2 ? (
          <TouchableOpacity
            style={[styles.nextBtn, !videoFile && styles.nextBtnDisabled]}
            onPress={() => setStep(2)}
            disabled={!videoFile}
          >
            <Text style={styles.nextBtnText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, (!title || loading) && styles.nextBtnDisabled]}
            onPress={handleUpload}
            disabled={!title || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFF" />
                <Text style={styles.nextBtnText}>Publier la vidéo</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 60,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  stepDotActive: { backgroundColor: '#06B6D4', borderColor: '#06B6D4' },
  stepDotText: { color: '#888', fontSize: 12, fontWeight: '700' },
  stepLine: { width: 80, height: 2, backgroundColor: '#222', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: '#06B6D4' },

  content: { padding: 20, paddingBottom: 40 },

  stepTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  typeCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  typeCardActive: { borderColor: '#06B6D4', backgroundColor: '#06B6D411' },
  typeEmoji: { fontSize: 28, marginBottom: 8 },
  typeLabel: { color: '#CCC', fontSize: 13, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  typeLabelActive: { color: '#06B6D4' },
  typeDesc: { color: '#666', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  dropZone: {
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#111',
    marginBottom: 20,
  },
  dropZoneSelected: { borderColor: '#06B6D4', backgroundColor: '#06B6D411' },
  uploadIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dropTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  dropSubtitle: { color: '#666', fontSize: 14 },
  fileName: { color: '#06B6D4', fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  fileSize: { color: '#888', fontSize: 13 },
  changeText: { color: '#555', fontSize: 12, marginTop: 8 },
  quickPickRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  quickPickText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  label: { color: '#CCC', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 18,
  },
  textArea: { height: 80, textAlignVertical: 'top' },

  thumbPicker: { marginBottom: 20, borderRadius: 12, overflow: 'hidden' },
  thumbPreview: { width: '100%', height: 180, borderRadius: 12 },
  thumbPlaceholder: {
    height: 140,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbPlaceholderText: { color: '#666', fontSize: 14, fontWeight: '600', marginTop: 8 },
  thumbPlaceholderSub: { color: '#444', fontSize: 12, marginTop: 4 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 16,
  },
  toggleLabel: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#333', padding: 3 },
  toggleActive: { backgroundColor: '#06B6D4' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#666' },
  toggleThumbActive: { backgroundColor: '#FFF', transform: [{ translateX: 20 }] },

  uploadProgress: { marginTop: 12 },
  uploadProgressBar: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  uploadProgressFill: { height: '100%', backgroundColor: '#06B6D4', borderRadius: 3 },
  uploadProgressText: { color: '#888', fontSize: 12, textAlign: 'center' },

  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06B6D4',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  nextBtnDisabled: { backgroundColor: '#063A4A', opacity: 0.6 },
  nextBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});

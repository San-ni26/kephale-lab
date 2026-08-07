import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { api, uploadAPI, tracksAPI } from '../../src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { requestMediaLibraryPermission } from '../../src/lib/permissions';

const GENRES = ['Afrobeat', 'Mandingue', 'Hip-Hop', 'R&B', 'Reggae', 'Pop', 'Gospel', 'Coupé-Décalé', 'Zouglou', 'Jazz', 'Trap', 'Électro'];

export default function UploadTrackScreen() {
  const queryClient = useQueryClient();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form state
  const [audioFile, setAudioFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState('');
  const [credits, setCredits] = useState('');
  const [price, setPrice] = useState('0');
  const [isExplicit, setIsExplicit] = useState(false);
  const [isExclusive, setIsExclusive] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // Demande proactive d'autorisation dès l'ouverture de l'écran
  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        }
      } catch (e) {
        console.warn('[UploadTrack] Permission init error:', e);
      }
    })();
  }, []);

  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'public.audio', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/m4a', 'audio/flac', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setAudioFile(result.assets[0]);
        if (!title) setTitle(result.assets[0].name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      try {
        const fallback = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (!fallback.canceled && fallback.assets && fallback.assets.length > 0) {
          setAudioFile(fallback.assets[0]);
          if (!title) setTitle(fallback.assets[0].name.replace(/\.[^.]+$/, ''));
        }
      } catch (fallbackErr) {
        Alert.alert('Erreur', 'Impossible de sélectionner le fichier audio.');
      }
    }
  };

  const handlePickCover = async () => {
    try {
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } catch {
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
        } catch {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
        }
      }
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCoverUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la galerie photo.');
    }
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleUpload = async () => {
    if (!audioFile) return;

    setLoading(true);
    setUploadProgress(5);

    try {
      // 1. Upload cover image if provided
      let coverUrl: string | undefined = undefined;
      if (coverUri) {
        const coverPresigned = await uploadAPI.getPresignedUrl({
          filename: 'cover.jpg',
          contentType: 'image/jpeg',
          type: 'image',
        });
        const { uploadUrl: coverUploadUrl, publicUrl: coverPublicUrl } = coverPresigned.data.data;
        await FileSystem.uploadAsync(coverUploadUrl, coverUri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });
        coverUrl = coverPublicUrl;
      }
      setUploadProgress(30);

      // 2. Get presigned URL for audio
      const presignedRes = await uploadAPI.getPresignedUrl({
        filename: audioFile.name,
        contentType: audioFile.mimeType || 'audio/mpeg',
        type: 'audio',
      });
      const { uploadUrl, publicUrl, key } = presignedRes.data.data;
      setUploadProgress(40);

      // 3. Upload audio file
      const uploadTask = FileSystem.createUploadTask(
        uploadUrl,
        audioFile.uri,
        {
          httpMethod: 'PUT',
          headers: { 'Content-Type': audioFile.mimeType || 'audio/mpeg' },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        },
        (progressData) => {
          const pct = (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100;
          setUploadProgress(40 + pct * 0.5);
        }
      );

      const uploadRes = await uploadTask.uploadAsync();
      if (uploadRes?.status !== 200 && uploadRes?.status !== 204) {
        throw new Error(`Upload échoué (${uploadRes?.status}): ${uploadRes?.body}`);
      }
      setUploadProgress(92);

      // 4. Create track in DB
      await tracksAPI.create({
        title: title.trim() || audioFile.name,
        audioUrl: publicUrl,
        s3Key: key,
        coverUrl,
        price: parseFloat(price) || 0,
        currency: 'XOF',
        genre: selectedGenres,
        isExplicit,
        albumId: albumId || undefined,
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['my-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      queryClient.invalidateQueries({ queryKey: ['public-artist'] });
      queryClient.invalidateQueries({ queryKey: ['public-album'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });

      Alert.alert('Succès !', 'Votre titre est publié et immédiatement visible au public.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erreur', e?.message || 'L\'upload a échoué. Veuillez réessayer.');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const canProceed = step === 1 ? !!audioFile : step === 2 ? !!title : true;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(s => s - 1) : router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uploader un titre</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStepWrap}>
            <View style={[styles.progressDot, step >= s && styles.progressDotActive]}>
              {step > s ? (
                <Ionicons name="checkmark" size={12} color="#FFF" />
              ) : (
                <Text style={styles.progressDotText}>{s}</Text>
              )}
            </View>
            {s < 3 && <View style={[styles.progressLine, step > s && styles.progressLineActive]} />}
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 1 — Pick audio file */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Sélectionnez votre fichier audio</Text>
            <Text style={styles.stepDesc}>Formats acceptés : MP3, WAV, FLAC, M4A</Text>

            <TouchableOpacity
              style={[styles.dropZone, audioFile && styles.dropZoneSelected]}
              onPress={handlePickAudio}
            >
              {audioFile ? (
                <>
                  <Ionicons name="musical-note" size={40} color="#FF5A00" />
                  <Text style={styles.fileName} numberOfLines={1}>{audioFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {audioFile.size ? `${(audioFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                  </Text>
                  <Text style={styles.changeText}>Toucher pour changer</Text>
                </>
              ) : (
                <>
                  <View style={styles.uploadIconWrap}>
                    <Ionicons name="cloud-upload-outline" size={48} color="#555" />
                  </View>
                  <Text style={styles.dropTitle}>Sélectionner un fichier</Text>
                  <Text style={styles.dropSubtitle}>MP3, WAV, FLAC · jusqu'à 500 MB</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2 — Metadata */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Informations du morceau</Text>

            {/* Cover image */}
            <Text style={styles.label}>Pochette (optionnel)</Text>
            <TouchableOpacity style={styles.coverPicker} onPress={handlePickCover}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverPreview} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={36} color="#555" />
                  <Text style={styles.coverPlaceholderText}>Ajouter une pochette</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Titre *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Titre du morceau"
              placeholderTextColor="#555"
            />

            <Text style={styles.label}>Prix (XOF) — 0 = Gratuit</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#555"
            />

            {/* Explicit toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsExplicit((v) => !v)}
            >
              <View>
                <Text style={styles.toggleLabel}>Contenu explicite</Text>
                <Text style={styles.toggleDesc}>Paroles ou thèmes pour adultes</Text>
              </View>
              <View style={[styles.toggle, isExplicit && styles.toggleActive]}>
                <View style={[styles.toggleThumb, isExplicit && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3 — Genres + Confirm */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Genres musicaux</Text>
            <Text style={styles.stepDesc}>Sélectionnez jusqu'à 3 genres</Text>

            <View style={styles.genreGrid}>
              {GENRES.map((g) => {
                const selected = selectedGenres.includes(g);
                const maxReached = selectedGenres.length >= 3 && !selected;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.genreChip,
                      selected && styles.genreChipSelected,
                      maxReached && styles.genreChipDisabled,
                    ]}
                    onPress={() => !maxReached && toggleGenre(g)}
                    disabled={maxReached}
                  >
                    <Text style={[styles.genreText, selected && styles.genreTextSelected]}>{g}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Résumé</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Fichier</Text>
                <Text style={styles.summaryVal} numberOfLines={1}>{audioFile?.name}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Titre</Text>
                <Text style={styles.summaryVal}>{title}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Prix</Text>
                <Text style={styles.summaryVal}>{parseFloat(price) > 0 ? `${price} XOF` : 'Gratuit'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Genres</Text>
                <Text style={styles.summaryVal}>{selectedGenres.join(', ') || '—'}</Text>
              </View>
            </View>

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

      {/* Bottom CTA */}
      <View style={styles.footer}>
        {step < 3 ? (
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={() => setStep(s => s + 1)}
            disabled={!canProceed}
          >
            <Text style={styles.nextBtnText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, loading && styles.nextBtnDisabled]}
            onPress={handleUpload}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFF" />
                <Text style={styles.nextBtnText}>Publier le titre</Text>
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

  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  progressStepWrap: { flexDirection: 'row', alignItems: 'center' },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  progressDotActive: { backgroundColor: '#FF5A00', borderColor: '#FF5A00' },
  progressDotText: { color: '#888', fontSize: 12, fontWeight: '700' },
  progressLine: { width: 60, height: 2, backgroundColor: '#222', marginHorizontal: 4 },
  progressLineActive: { backgroundColor: '#FF5A00' },

  content: { padding: 20, paddingBottom: 40 },

  stepTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  stepDesc: { color: '#888', fontSize: 14, marginBottom: 24 },

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
  dropZoneSelected: {
    borderColor: '#FF5A00',
    backgroundColor: '#FF5A0011',
  },
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
  fileName: { color: '#FF5A00', fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  fileSize: { color: '#888', fontSize: 13 },
  changeText: { color: '#555', fontSize: 12, marginTop: 8 },

  label: { color: '#CCC', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 16,
  },

  coverPicker: {
    marginBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: 200, borderRadius: 14 },
  coverPlaceholder: {
    height: 140,
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: { color: '#555', fontSize: 14, marginTop: 8 },

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
  toggleDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    padding: 3,
  },
  toggleActive: { backgroundColor: '#FF5A00' },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#666',
  },
  toggleThumbActive: {
    backgroundColor: '#FFF',
    transform: [{ translateX: 20 }],
  },

  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#141414',
  },
  genreChipSelected: {
    borderColor: '#FF5A00',
    backgroundColor: '#FF5A0022',
  },
  genreChipDisabled: { opacity: 0.35 },
  genreText: { color: '#888', fontWeight: '600', fontSize: 13 },
  genreTextSelected: { color: '#FF5A00' },

  summaryBox: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 20,
  },
  summaryTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  summaryKey: { color: '#888', fontSize: 13 },
  summaryVal: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  uploadProgress: { marginTop: 12 },
  uploadProgressBar: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#FF5A00',
    borderRadius: 3,
  },
  uploadProgressText: { color: '#888', fontSize: 12, textAlign: 'center' },

  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A00',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  nextBtnDisabled: { backgroundColor: '#3A1A00', opacity: 0.6 },
  nextBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});

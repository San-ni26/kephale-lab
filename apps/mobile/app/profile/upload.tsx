import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/index';

export default function UploadScreen() {
  const { user } = useAuthStore();
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'public.audio', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/m4a', 'audio/flac', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      try {
        const fallback = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (!fallback.canceled && fallback.assets && fallback.assets.length > 0) {
          setSelectedFile(fallback.assets[0]);
        }
      } catch (fallbackErr) {
        console.error('File selection error', fallbackErr);
        Alert.alert('Erreur', 'Impossible de sélectionner le fichier.');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setProgress(10); // Start progress

    try {
      // 1. Get Presigned URL
      const presignedRes = await api.post('/upload/presigned-url', {
        filename: selectedFile.name,
        contentType: selectedFile.mimeType || 'audio/mpeg',
        type: 'audio',
      });

      const { uploadUrl, publicUrl, key } = presignedRes.data.data;
      setProgress(40);

      // 2. Upload file to MinIO/S3 using Expo FileSystem
      const uploadTask = FileSystem.createUploadTask(
        uploadUrl,
        selectedFile.uri,
        {
          httpMethod: 'PUT',
          headers: {
            'Content-Type': selectedFile.mimeType || 'audio/mpeg',
          },
        },
        (data) => {
          const progressPercent = (data.totalBytesSent / data.totalBytesExpectedToSend) * 100;
          // Scale from 40% to 90%
          setProgress(40 + (progressPercent * 0.5));
        }
      );

      const response = await uploadTask.uploadAsync();

      if (response?.status !== 200) {
        throw new Error('Échec de l\'upload S3');
      }

      setProgress(100);

      // 3. Call backend to create the Track entry in the DB
      await api.post('/tracks', { title: selectedFile.name, audioUrl: publicUrl, s3Key: key });

      Alert.alert('Succès !', 'Votre titre a été uploadé avec succès.', [
        { text: 'OK', onPress: () => router.replace('/profile') }
      ]);
    } catch (error: any) {
      console.error('Upload Error:', error);
      Alert.alert('Erreur', 'L\'upload a échoué. Veuillez réessayer.');
    } finally {
      setLoading(false);
      setProgress(0);
      setSelectedFile(null);
    }
  };

  if (user?.role !== 'ARTIST') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Retour</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.errorText}>Vous devez être Artiste pour uploader de la musique.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Annuler</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Uploader un titre</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {!selectedFile ? (
          <TouchableOpacity style={styles.uploadBox} onPress={handleSelectFile}>
            <Ionicons name="musical-notes-outline" size={48} color="#FF5A00" style={{ marginBottom: 8 }} />
            <Text style={styles.uploadTitle}>Sélectionnez un fichier audio</Text>
            <Text style={styles.uploadSubtitle}>Formats acceptés : MP3, WAV</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.fileSelectedBox}>
            <Ionicons name="document-text-outline" size={24} color="#FF5A00" style={{ marginRight: 10 }} />
            <View style={styles.fileSelectedInfo}>
              <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
              <Text style={styles.fileSize}>
                {(selectedFile.size ? (selectedFile.size / (1024 * 1024)).toFixed(2) : '0')} MB
              </Text>
            </View>
            {!loading && (
              <TouchableOpacity onPress={() => setSelectedFile(null)}>
                <Ionicons name="close-circle-outline" size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.submitButton, (!selectedFile || loading) && styles.submitButtonDisabled]}
          onPress={handleUpload}
          disabled={!selectedFile || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Uploader maintenant</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: { width: 60 },
  backButtonText: { color: '#9CA3AF', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  
  content: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  uploadBox: {
    borderWidth: 2,
    borderColor: '#333333',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  uploadIcon: { fontSize: 48, marginBottom: 16 },
  uploadTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  uploadSubtitle: { color: '#6B7280', fontSize: 14 },
  
  fileSelectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  fileSelectedIcon: { fontSize: 24, marginRight: 12 },
  fileSelectedInfo: { flex: 1 },
  fileName: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  fileSize: { color: '#9CA3AF', fontSize: 14 },
  removeFileText: { color: '#EF4444', fontSize: 20, fontWeight: '700', padding: 8 },

  progressContainer: {
    marginTop: 20,
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#8B5CF6',
  },
  progressText: {
    position: 'absolute',
    top: -24,
    right: 0,
    color: '#9CA3AF',
    fontSize: 12,
  },

  submitButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 30,
  },
  submitButtonDisabled: {
    backgroundColor: '#4C1D95',
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: { color: '#EF4444', fontSize: 16, textAlign: 'center' }
});

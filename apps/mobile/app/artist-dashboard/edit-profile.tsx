import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { artistsAPI } from '../../src/lib/api';
import { uploadToS3 } from '../../src/lib/upload';
import { useAuthStore } from '../../src/stores';
import { requestMediaLibraryPermission } from '../../src/lib/permissions';

export default function EditArtistProfileScreen() {
  const { user, accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const [stageName, setStageName] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('ML');
  const [instagram, setInstagram] = useState('');
  
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch current data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['artist-dashboard'],
    queryFn: () => artistsAPI.getDashboard(),
  });

  const artist = dashboardData?.data?.data?.artist;

  useEffect(() => {
    if (artist) {
      setStageName(artist.stageName || '');
      setBio(artist.bio || '');
      setCountry(artist.country || 'ML');
      setInstagram(artist.instagramUrl || '');
      setAvatarUri(artist.avatar || null);
      setCoverUri(artist.coverImage || null);
    }
  }, [artist]);

  const pickImage = async (type: 'avatar' | 'cover') => {
    try {
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.85,
      });

      if (!result.canceled && result.assets[0]) {
        if (type === 'avatar') setAvatarUri(result.assets[0].uri);
        else setCoverUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la galerie.');
    }
  };

  const handleSave = async () => {
    if (!stageName.trim()) {
      Alert.alert('Erreur', 'Le nom de scène est obligatoire');
      return;
    }

    try {
      setIsSubmitting(true);
      setUploadProgress(10);

      let finalAvatar = avatarUri;
      let finalCover = coverUri;

      // Si l'URI a changé (c'est un fichier local / file://)
      if (avatarUri && !avatarUri.startsWith('http')) {
        const uploadRes = await uploadToS3({
          uri: avatarUri,
          type: 'image',
          filename: `avatar_${Date.now()}.jpg`,
          onProgress: (p) => setUploadProgress(p * 0.4),
        });
        finalAvatar = uploadRes.publicUrl;
      }
      
      setUploadProgress(50);

      if (coverUri && !coverUri.startsWith('http')) {
        const uploadRes = await uploadToS3({
          uri: coverUri,
          type: 'image',
          filename: `banner_${Date.now()}.jpg`,
          onProgress: (p) => setUploadProgress(50 + p * 0.4),
        });
        finalCover = uploadRes.publicUrl;
      }
      
      setUploadProgress(90);

      // Save to API
      await artistsAPI.updateProfile({
        stageName: stageName.trim(),
        bio: bio.trim(),
        country,
        instagramUrl: instagram.trim(),
        avatar: finalAvatar,
        coverImage: finalCover,
      });

      // Synchronize with local user state
      useAuthStore.getState().updateUser({
        name: stageName.trim(),
        ...(finalAvatar ? { avatar: finalAvatar } : {}),
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['artist', artist?.id] });
      
      Alert.alert('Succès', 'Votre profil a été mis à jour !', [
        { text: 'OK', onPress: () => router.back() }
      ]);

    } catch (e: any) {
      console.error(e);
      Alert.alert('Erreur', e.response?.data?.error?.message || 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color="#FF5A00" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifier mon profil</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* Cover Image */}
          <View style={styles.coverSection}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image" size={40} color="#333" />
              </View>
            )}
            <View style={styles.coverOverlay} />
            <TouchableOpacity style={styles.editCoverBtn} onPress={() => pickImage('cover')}>
              <Ionicons name="camera" size={20} color="#FFF" />
              <Text style={styles.editImageText}>Couverture</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar Image */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={() => pickImage('avatar')}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={40} color="#444" />
                </View>
              )}
              <View style={styles.editAvatarBadge}>
                <Ionicons name="camera" size={16} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Nom de scène *</Text>
            <TextInput
              style={styles.input}
              value={stageName}
              onChangeText={setStageName}
              placeholder="Votre nom de scène"
              placeholderTextColor="#555"
            />

            <Text style={styles.label}>Biographie</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Racontez votre histoire..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={4}
              maxLength={2000}
            />

            <Text style={styles.label}>Pays (Code ex: ML, SN, CI)</Text>
            <TextInput
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="Code ISO Pays"
              placeholderTextColor="#555"
              maxLength={2}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Instagram (Lien URL)</Text>
            <TextInput
              style={styles.input}
              value={instagram}
              onChangeText={setInstagram}
              placeholder="https://instagram.com/..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.saveBtn, isSubmitting && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
        {isSubmitting && (
          <Text style={styles.progressText}>Sauvegarde en cours... {Math.round(uploadProgress)}%</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 40 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  scrollContent: {
    paddingBottom: 40,
  },

  coverSection: {
    width: '100%',
    height: 180,
    position: 'relative',
    backgroundColor: '#111',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  editCoverBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    zIndex: 20,
  },
  editImageText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  avatarSection: {
    alignSelf: 'center',
    marginTop: -50,
    marginBottom: 20,
    zIndex: 10,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#0A0A0A',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#0A0A0A',
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0A0A0A',
  },

  form: {
    paddingHorizontal: 24,
  },
  label: { color: '#CCC', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFF',
    fontSize: 15,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },

  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    backgroundColor: '#0A0A0A',
  },
  saveBtn: {
    backgroundColor: '#FF5A00',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  progressText: {
    color: '#FF5A00',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
  },
});

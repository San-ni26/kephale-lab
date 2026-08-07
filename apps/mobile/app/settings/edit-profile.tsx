import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/stores';
import { userAPI, uploadAPI } from '../../src/lib/api';
import { useMutation } from '@tanstack/react-query';
import { requestMediaLibraryPermission } from '../../src/lib/permissions';

export default function EditProfileScreen() {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => userAPI.updateProfile({ name, avatar }),
    onSuccess: (res) => {
      updateUser(res.data.data);
      Alert.alert('Succès', 'Votre profil a été mis à jour.');
      router.back();
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Une erreur est survenue');
    }
  });

  const handlePickImage = async () => {
    try {
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setLocalImageUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la galerie.');
    }
  };

  const uploadImageToS3 = async (uri: string) => {
    // Obtenir le presigned URL
    const filename = uri.split('/').pop() || 'avatar.jpg';
    const res = await uploadAPI.getPresignedUrl({
      filename,
      contentType: 'image/jpeg',
      type: 'image',
    });
    
    const { uploadUrl, publicUrl } = res.data.data;
    
    // Télécharger vers S3
    const response = await fetch(uri);
    const blob = await response.blob();
    
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    
    return publicUrl;
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Erreur', 'Le nom ne peut pas être vide.');
    
    try {
      if (localImageUri) {
        setIsUploading(true);
        const uploadedUrl = await uploadImageToS3(localImageUri);
        setAvatar(uploadedUrl);
        // On attend la prochaine exécution de la boucle d'événement
        // mais le plus simple est de passer directement l'URL à la mutation
        userAPI.updateProfile({ name, avatar: uploadedUrl })
          .then((res) => {
            updateUser(res.data.data);
            Alert.alert('Succès', 'Votre profil a été mis à jour.');
            router.back();
          })
          .catch((err) => {
            Alert.alert('Erreur', err?.response?.data?.error?.message || 'Une erreur est survenue');
          })
          .finally(() => setIsUploading(false));
      } else {
        updateMutation.mutate();
      }
    } catch (e) {
      setIsUploading(false);
      Alert.alert('Erreur', 'Impossible de télécharger l\'image.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Modifier le profil</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Nom complet</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Votre nom"
                placeholderTextColor="#666"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Photo de profil</Text>
            <TouchableOpacity style={styles.avatarPicker} onPress={handlePickImage}>
              {localImageUri || avatar ? (
                <View style={styles.avatarPreviewContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <View style={styles.avatarPreview}>
                    <Image source={{ uri: localImageUri || avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                    <View style={{ position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                       <Ionicons name="camera" size={30} color="#FFF" />
                    </View>
                  </View>
                  <Text style={styles.changeAvatarText}>Changer l'image</Text>
                </View>
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color="#888" />
                  <Text style={styles.avatarPlaceholderText}>Ajouter une photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.saveBtn, (updateMutation.isPending || isUploading) && styles.saveBtnDisabled]} 
            onPress={handleSave}
            disabled={updateMutation.isPending || isUploading}
          >
            {(updateMutation.isPending || isUploading) ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { padding: 4 },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  formGroup: { marginBottom: 24 },
  label: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#FFF', fontSize: 16 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  saveBtn: {
    backgroundColor: '#FF5A00',
    borderRadius: 30,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  avatarPicker: {
    alignItems: 'center',
    marginVertical: 10,
  },
  avatarPreviewContainer: {
    alignItems: 'center',
  },
  avatarPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  changeAvatarText: { color: '#FF5A00', fontSize: 14, fontWeight: '500' },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  avatarPlaceholderText: { color: '#888', fontSize: 12, marginTop: 4 },
});

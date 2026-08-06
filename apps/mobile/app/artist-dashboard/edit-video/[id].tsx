import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { videosAPI } from '../../../src/lib/api';
import VideoThumbnail from '../../../src/components/VideoThumbnail';

export default function EditVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['video', id],
    queryFn: () => videosAPI.getById(id!),
    enabled: !!id,
  });

  const video = data?.data?.data;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [isExplicit, setIsExplicit] = useState(false);

  useEffect(() => {
    if (video) {
      setTitle(video.title || '');
      setDescription(video.description || '');
      setPrice(video.price?.toString() || '0');
      setIsExplicit(video.isExplicit || false);
    }
  }, [video]);

  const updateMutation = useMutation({
    mutationFn: (updates: any) => videosAPI.update(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-videos'] });
      queryClient.invalidateQueries({ queryKey: ['video', id] });
      Alert.alert('Succès', 'La vidéo a été mise à jour.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de mettre à jour la vidéo.');
    }
  });

  const handleUpdate = () => {
    if (!title.trim()) {
      return Alert.alert('Erreur', 'Le titre est requis.');
    }
    updateMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      price: parseFloat(price) || 0,
      isExplicit,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier la vidéo</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#06B6D4" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !video) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={{ color: '#FFF' }}>Erreur lors du chargement.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifier la vidéo</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.previewCard}>
          <VideoThumbnail
            sourceUrl={video.thumbnailUrl}
            videoUrl={video.videoUrl}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <Text style={styles.previewTitle} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.previewStatus}>{video.status}</Text>
        </View>

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

        {video.type === 'CLIP' && (
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
          <View>
            <Text style={styles.toggleLabel}>Contenu explicite</Text>
            <Text style={styles.toggleDesc}>Paroles ou thèmes pour adultes</Text>
          </View>
          <View style={[styles.toggle, isExplicit && styles.toggleActive]}>
            <View style={[styles.toggleThumb, isExplicit && styles.toggleThumbActive]} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, updateMutation.isPending && styles.saveBtnDisabled]}
          onPress={handleUpdate}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Enregistrer les modifications</Text>
          )}
        </TouchableOpacity>
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
  backBtn: { width: 36 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  content: { padding: 20, paddingBottom: 40 },

  previewCard: {
    alignItems: 'center',
    marginBottom: 32,
  },
  previewImage: {
    width: 200,
    height: 120,
    borderRadius: 16,
    marginBottom: 16,
  },
  previewTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  previewStatus: { color: '#888', fontSize: 12, fontWeight: '600' },

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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },

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
    marginTop: 8,
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
  toggleActive: { backgroundColor: '#06B6D4' },
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

  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06B6D4',
    borderRadius: 16,
    padding: 18,
  },
  saveBtnDisabled: { backgroundColor: '#063A4A', opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});

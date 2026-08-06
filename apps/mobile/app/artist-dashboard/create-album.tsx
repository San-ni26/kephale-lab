import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { albumsAPI } from '../../src/lib/api';
import { uploadToS3 } from '../../src/lib/upload';
import { useQueryClient } from '@tanstack/react-query';
import { requestMediaLibraryPermission } from '../../src/lib/permissions';

export default function CreateAlbumScreen() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [releaseDate, setReleaseDate] = useState('');

  const handlePickCover = async () => {
    try {
      const hasPerm = await requestMediaLibraryPermission();
      if (!hasPerm) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCoverUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la galerie photo.');
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Le titre de l\'album est obligatoire.');
      return;
    }
    if (!coverUri) {
      Alert.alert('Pochette requise', 'Veuillez ajouter une image de pochette.');
      return;
    }

    setLoading(true);

    try {
      // Upload cover image
      const uploadRes = await uploadToS3({
        uri: coverUri,
        type: 'image',
        filename: `album_cover_${Date.now()}.jpg`,
      });

      // Create album
      await albumsAPI.create({
        title: title.trim(),
        description: description.trim() || undefined,
        coverUrl: uploadRes.publicUrl,
        price: parseFloat(price) || 0,
        currency: 'XOF',
        releaseDate: releaseDate ? new Date(releaseDate).toISOString() : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['my-albums'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      queryClient.invalidateQueries({ queryKey: ['public-artist'] });
      queryClient.invalidateQueries({ queryKey: ['public-album'] });

      Alert.alert('Album créé !', 'Vous pouvez maintenant y ajouter vos morceaux.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'La création a échoué.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Créer un album</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cover image picker */}
        <TouchableOpacity style={styles.coverPicker} onPress={handlePickCover} activeOpacity={0.8}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={48} color="#444" />
              <Text style={styles.coverPlaceholderTitle}>Pochette de l'album</Text>
              <Text style={styles.coverPlaceholderSub}>Format carré recommandé</Text>
            </View>
          )}
          <View style={styles.coverEditBadge}>
            <Ionicons name="camera" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.label}>Titre de l'album *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Nom de l'album"
          placeholderTextColor="#555"
        />

        {/* Description */}
        <Text style={styles.label}>Description (optionnel)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Présentation, thème, contexte..."
          placeholderTextColor="#555"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Price */}
        <Text style={styles.label}>Prix (XOF) — 0 = Gratuit</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#555"
        />

        {/* Release Date */}
        <Text style={styles.label}>Date de sortie (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={releaseDate}
          onChangeText={setReleaseDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#555"
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#8B5CF6" />
          <Text style={styles.infoText}>
            Après la création, vous pourrez ajouter vos morceaux à cet album depuis la gestion de vos titres.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (!title || !coverUri || loading) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title || !coverUri || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="albums" size={20} color="#FFF" />
              <Text style={styles.createBtnText}>Créer l'album</Text>
            </>
          )}
        </TouchableOpacity>
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

  content: { padding: 20, paddingBottom: 40 },

  coverPicker: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: 20,
    marginBottom: 28,
    position: 'relative',
  },
  coverImage: { width: 180, height: 180, borderRadius: 20 },
  coverPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 20,
    backgroundColor: '#141414',
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderTitle: { color: '#888', fontSize: 14, fontWeight: '600', marginTop: 10 },
  coverPlaceholderSub: { color: '#555', fontSize: 12, marginTop: 4 },
  coverEditBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
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
  textArea: { height: 100, textAlignVertical: 'top' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#8B5CF611',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#8B5CF633',
    marginTop: 8,
  },
  infoText: { flex: 1, color: '#8B5CF6', fontSize: 13, lineHeight: 20 },

  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  createBtnDisabled: { backgroundColor: '#3B2770', opacity: 0.6 },
  createBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});

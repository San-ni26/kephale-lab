import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores';
import { userAPI, authAPI } from '../../src/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clearEntireAppCache } from '../../src/lib/cacheManager';

export default function DeleteAccountScreen() {
  const { user, logout, refreshToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [artistAction, setArtistAction] = useState<'TRANSFER' | 'DELETE' | null>(null);

  const isArtist = !!user?.artistProfile;
  const pendingPayout = user?.artistProfile?.pendingPayout || 0;
  const canDelete = !isArtist || pendingPayout < 500;

  const deleteMutation = useMutation({
    mutationFn: () => userAPI.deleteAccount({
      password: password || undefined,
      artistAction: isArtist ? artistAction || undefined : undefined,
    }),
    onSuccess: async () => {
      Alert.alert('Compte supprimé', 'Votre compte a été supprimé avec succès.');
      if (refreshToken) {
        try { await authAPI.logout(refreshToken); } catch (e) {}
      }
      await clearEntireAppCache({ clearAuth: true, clearAllStorage: true, queryClient });
      router.replace('/');
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de supprimer le compte');
    }
  });

  const handleDelete = () => {
    if (isArtist && pendingPayout >= 500) {
      return Alert.alert('Action bloquée', 'Veuillez retirer vos fonds (≥ 500 FCFA) avant de supprimer votre compte.');
    }
    if (isArtist && !artistAction) {
      return Alert.alert('Erreur', 'Veuillez choisir ce que vous souhaitez faire de vos contenus.');
    }
    
    Alert.alert(
      'Confirmation de suppression',
      'Cette action est irréversible. Toutes vos données seront perdues définitivement. Êtes-vous vraiment sûr ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Oui, supprimer', 
          style: 'destructive',
          onPress: () => deleteMutation.mutate()
        }
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Supprimer le compte</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="warning" size={60} color="#FF3B30" style={{ alignSelf: 'center', marginBottom: 16 }} />
        <Text style={styles.warningTitle}>Action irréversible</Text>
        <Text style={styles.warningText}>
          La suppression de votre compte entraînera la perte définitive de toutes vos données (abonnements, favoris, historique).
        </Text>

        {isArtist && (
          <View style={styles.artistSection}>
            <Text style={styles.artistTitle}>Compte Artiste détecté</Text>
            <Text style={styles.artistText}>
              Fonds disponibles : {pendingPayout} FCFA
            </Text>
            
            {pendingPayout >= 500 ? (
              <View style={styles.blockedBox}>
                <Ionicons name="lock-closed" size={20} color="#FF9500" />
                <Text style={styles.blockedText}>
                  Vous avez des fonds en attente. Veuillez d'abord les retirer depuis votre espace artiste pour pouvoir supprimer votre compte.
                </Text>
              </View>
            ) : (
              <View style={styles.actionBox}>
                <Text style={styles.actionTitle}>Que faire de vos publications (sons, albums, clips) ?</Text>
                
                <TouchableOpacity 
                  style={[styles.radioOption, artistAction === 'TRANSFER' && styles.radioOptionSelected]}
                  onPress={() => setArtistAction('TRANSFER')}
                >
                  <Ionicons name={artistAction === 'TRANSFER' ? 'radio-button-on' : 'radio-button-off'} size={24} color={artistAction === 'TRANSFER' ? '#FF5A00' : '#888'} />
                  <Text style={[styles.radioText, artistAction === 'TRANSFER' && styles.radioTextSelected]}>
                    Laisser mes contenus en ligne et céder les droits à l'application Kephale
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.radioOption, artistAction === 'DELETE' && styles.radioOptionSelected]}
                  onPress={() => setArtistAction('DELETE')}
                >
                  <Ionicons name={artistAction === 'DELETE' ? 'radio-button-on' : 'radio-button-off'} size={24} color={artistAction === 'DELETE' ? '#FF3B30' : '#888'} />
                  <Text style={[styles.radioText, artistAction === 'DELETE' && styles.radioTextSelected]}>
                    Supprimer définitivement tous mes contenus
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {canDelete && (
          <View style={styles.passwordSection}>
            <Text style={styles.label}>Confirmez avec votre mot de passe</Text>
            <Text style={styles.helperText}>(Laissez vide si vous vous êtes inscrit via Google uniquement)</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Votre mot de passe"
                placeholderTextColor="#666"
                secureTextEntry
              />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[
            styles.deleteBtn, 
            (!canDelete || deleteMutation.isPending) && styles.deleteBtnDisabled
          ]} 
          onPress={handleDelete}
          disabled={!canDelete || deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.deleteBtnText}>Supprimer définitivement</Text>
          )}
        </TouchableOpacity>
      </View>
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
  content: { padding: 20, paddingBottom: 100 },
  
  warningTitle: { color: '#FF3B30', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  warningText: { color: '#CCC', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  artistSection: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 32,
  },
  artistTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  artistText: { color: '#888', fontSize: 14, marginBottom: 16 },
  
  blockedBox: {
    flexDirection: 'row',
    backgroundColor: '#FF950020',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF950050',
    alignItems: 'center',
  },
  blockedText: { color: '#FF9500', flex: 1, marginLeft: 12, fontSize: 14, lineHeight: 20 },

  actionBox: { marginTop: 8 },
  actionTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  radioOptionSelected: { borderColor: '#555', backgroundColor: '#222' },
  radioText: { flex: 1, color: '#888', fontSize: 14, marginLeft: 12, lineHeight: 20 },
  radioTextSelected: { color: '#FFF' },

  passwordSection: { marginBottom: 32 },
  label: { color: '#FFF', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  helperText: { color: '#666', fontSize: 12, marginBottom: 12 },
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
  deleteBtn: {
    backgroundColor: '#FF3B30',
    borderRadius: 30,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

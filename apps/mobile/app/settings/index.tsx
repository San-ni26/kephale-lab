import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores';
import { useQueryClient } from '@tanstack/react-query';
import { clearEntireAppCache, getAppCacheSize, openAppSettingsPermissions } from '../../src/lib/cacheManager';

export default function SettingsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [cacheSize, setCacheSize] = useState('Calcul en cours...');
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    refreshCacheSize();
  }, []);

  const refreshCacheSize = async () => {
    const res = await getAppCacheSize();
    setCacheSize(res.formattedSize);
  };

  const handleClearCache = () => {
    Alert.alert(
      'Vider le cache',
      'Cette action va libérer de l\'espace de stockage et supprimer les fichiers temporaires (images en cache, aperçus vidéos, requêtes hors-ligne). Vos identifiants restent conservés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider le cache',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearEntireAppCache({ clearAuth: false, queryClient });
              await refreshCacheSize();
              Alert.alert('Succès', 'Le cache a été vidé avec succès !');
            } catch {
              Alert.alert('Erreur', 'Impossible de vider le cache.');
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleManagePermissions = async () => {
    Alert.alert(
      'Autorisations système',
      'Vous allez être redirigé vers les paramètres de votre téléphone pour activer, désactiver ou réinitialiser les autorisations (Photos, Caméra, Micro, Notifications).',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Ouvrir les Réglages', onPress: openAppSettingsPermissions },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Général</Text>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/settings/edit-profile')}
          >
            <View style={styles.menuIconBox}>
              <Ionicons name="person-outline" size={20} color="#FFF" />
            </View>
            <Text style={styles.menuItemText}>Modifier le profil</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations légales</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuIconBox}>
              <Ionicons name="document-text-outline" size={20} color="#FFF" />
            </View>
            <Text style={styles.menuItemText}>Politique de confidentialité</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuIconBox}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
            </View>
            <Text style={styles.menuItemText}>Conditions d'utilisation</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stockage et Données</Text>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleClearCache}
            disabled={isClearing}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#1A2A3A' }]}>
              {isClearing ? (
                <ActivityIndicator size="small" color="#0A84FF" />
              ) : (
                <Ionicons name="trash-bin-outline" size={20} color="#0A84FF" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>Vider le cache de l'application</Text>
              <Text style={styles.menuItemSubText}>Libère de l'espace ({cacheSize})</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleManagePermissions}
          >
            <View style={[styles.menuIconBox, { backgroundColor: '#2A1A3A' }]}>
              <Ionicons name="key-outline" size={20} color="#BF5AF2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>Autorisations système</Text>
              <Text style={styles.menuItemSubText}>Micro, caméra, photos, notifications</Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zone de danger</Text>
          
          <TouchableOpacity 
            style={styles.deleteBtn}
            onPress={() => router.push('/settings/delete-account')}
          >
            <Ionicons name="warning-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteBtnText}>Supprimer mon compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  section: { marginBottom: 32 },
  sectionTitle: { color: '#888', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  menuItemSubText: { color: '#888', fontSize: 12, marginTop: 2 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B3015',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B3030',
  },
  deleteBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '600', marginLeft: 12 },
});

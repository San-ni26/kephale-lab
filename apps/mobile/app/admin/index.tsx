import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { adminAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';

export default function AdminDashboardScreen() {
  const { user } = useAuthStore();

  // Redirect if not admin
  if (user?.role !== 'ADMIN') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: '#FFF' }}>Accès refusé.</Text>
      </SafeAreaView>
    );
  }

  const { data: statsResponse, isLoading, error } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => adminAPI.getStats(),
  });

  const stats = statsResponse?.data?.data;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#FF5A00" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (error || !stats) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: '#FF3B30', textAlign: 'center', marginTop: 100 }}>
          Erreur lors du chargement des statistiques.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Panneau d'Administration</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* REVENUE CARD */}
        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Bénéfices générés (Net)</Text>
          <Text style={styles.revenueValue}>{stats.revenueFcfa.toLocaleString()} FCFA</Text>
          <Text style={styles.revenueSub}>Part de la plateforme sur les ventes, abonnements et jetons.</Text>
        </View>

        {/* STATS GRID */}
        <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
        <View style={styles.grid}>
          
          <View style={styles.gridItem}>
            <Ionicons name="people" size={24} color="#007AFF" />
            <Text style={styles.gridValue}>{stats.users}</Text>
            <Text style={styles.gridLabel}>Utilisateurs</Text>
          </View>
          
          <View style={styles.gridItem}>
            <Ionicons name="mic" size={24} color="#FF9500" />
            <Text style={styles.gridValue}>{stats.artists}</Text>
            <Text style={styles.gridLabel}>Artistes</Text>
          </View>

          <View style={styles.gridItem}>
            <Ionicons name="musical-notes" size={24} color="#34C759" />
            <Text style={styles.gridValue}>{stats.content.tracks}</Text>
            <Text style={styles.gridLabel}>Musiques</Text>
          </View>
          
          <View style={styles.gridItem}>
            <Ionicons name="film" size={24} color="#AF52DE" />
            <Text style={styles.gridValue}>{stats.content.videos}</Text>
            <Text style={styles.gridLabel}>Vidéos (Clips)</Text>
          </View>

        </View>
        
        {/* ADMIN TOOLS */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>

        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: '#E0A96D55', borderWidth: 1 }]}
          onPress={() => router.push('/admin/ads')}
        >
          <Ionicons name="megaphone-outline" size={20} color="#E0A96D" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionBtnText, { color: '#E0A96D', fontWeight: '700' }]}>
              Régie Publicitaire & Campagnes
            </Text>
            <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
              Création d'annonces, diffusion ciblée et statistiques clients
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#E0A96D" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/admin/withdrawals')}>
          <Ionicons name="cash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
          <Text style={styles.actionBtnText}>Gérer les demandes de retrait</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
          <Text style={styles.actionBtnText}>Modération des contenus (À venir)</Text>
        </TouchableOpacity>

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
  
  revenueCard: {
    backgroundColor: '#FF5A0015',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF5A0050',
    alignItems: 'center',
    marginBottom: 32,
  },
  revenueLabel: { color: '#FF5A00', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  revenueValue: { color: '#FFF', fontSize: 36, fontWeight: 'bold', marginBottom: 8 },
  revenueSub: { color: '#888', fontSize: 12, textAlign: 'center' },

  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#111',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
    marginBottom: 16,
  },
  gridValue: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  gridLabel: { color: '#888', fontSize: 14 },
  
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '500' },
});

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { livesAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';

export default function MyLivesScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['lives-list'],
    queryFn: () => livesAPI.list(),
  });

  const myLives = (data?.data?.data || []).filter((l: any) => l.artistId === user?.artistProfile?.id || l.artist?.userId === user?.id);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => livesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lives-list'] });
      Alert.alert('Succès', 'Le live a été supprimé.');
    },
    onError: (e: any) => {
      Alert.alert('Erreur', e.response?.data?.error?.message || 'Impossible de supprimer ce live.');
    }
  });

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer',
      'Êtes-vous sûr de vouloir annuler ce live programmé ?',
      [
        { text: 'Non', style: 'cancel' },
        { text: 'Oui, supprimer', style: 'destructive', onPress: () => deleteMutation.mutate(id) }
      ]
    );
  };

  const endLiveMutation = useMutation({
    mutationFn: (id: string) => livesAPI.end(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lives-list'] });
      Alert.alert('Succès', 'Le live a été terminé.');
    },
    onError: (e: any) => {
      Alert.alert('Erreur', e.response?.data?.error?.message || 'Impossible de terminer ce live.');
    }
  });

  const handleEnd = (id: string) => {
    Alert.alert(
      'Terminer',
      'Voulez-vous clôturer ce live en cours ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Oui, terminer', style: 'destructive', onPress: () => endLiveMutation.mutate(id) }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.card, item.status === 'LIVE' && styles.cardLive]}>
      <View style={styles.cardHeader}>
        <View style={item.status === 'LIVE' ? styles.badgeLive : styles.badgeScheduled}>
          <Text style={item.status === 'LIVE' ? styles.badgeTextLive : styles.badgeTextScheduled}>
            {item.status === 'LIVE' ? 'EN DIRECT' : 'PROGRAMMÉ'}
          </Text>
        </View>
        <Text style={styles.dateText}>
          {item.status === 'LIVE' ? 'Actuellement' : 
           (item.scheduledAt ? new Date(item.scheduledAt).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
          }) : 'Maintenant')}
        </Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.description && <Text style={styles.description}>{item.description}</Text>}
      
      <View style={styles.footer}>
        <View style={styles.stats}>
          <Ionicons name="people" size={16} color="#888" />
          <Text style={styles.statsText}>{item.maxGuests} places</Text>
        </View>
        
        {item.status === 'SCHEDULED' ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash" size={16} color="#FFF" />
            <Text style={styles.deleteBtnText}>Supprimer</Text>
          </TouchableOpacity>
        ) : item.status === 'LIVE' ? (
          <TouchableOpacity style={styles.endBtn} onPress={() => handleEnd(item.id)}>
            <Ionicons name="stop-circle" size={16} color="#FFF" />
            <Text style={styles.endBtnText}>Terminer le Live</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Directs</Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : myLives.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="radio" size={60} color="#333" />
          <Text style={styles.emptyTitle}>Aucun direct prévu</Text>
          <Text style={styles.emptyDesc}>Vous n'avez pas de live programmé en ce moment.</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push('/live/create')}>
            <Text style={styles.ctaText}>Programmer un Live</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={myLives}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyDesc: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  ctaBtn: { backgroundColor: '#FF5A00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  ctaText: { color: '#FFF', fontWeight: '700' },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLive: {
    borderColor: '#EF444455',
    backgroundColor: '#EF44440A',
  },
  badgeScheduled: {
    backgroundColor: '#3B82F622',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeLive: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeTextScheduled: { color: '#3B82F6', fontSize: 10, fontWeight: '800' },
  badgeTextLive: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  dateText: { color: '#888', fontSize: 12 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { color: '#AAA', fontSize: 13, marginBottom: 16 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 12,
  },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statsText: { color: '#888', fontSize: 13 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  deleteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  endBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});

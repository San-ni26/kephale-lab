import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../src/lib/api';

export default function AdminWithdrawalsScreen() {
  const queryClient = useQueryClient();

  const { data: response, isLoading } = useQuery({
    queryKey: ['adminWithdrawals'],
    queryFn: () => adminAPI.getWithdrawals(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'COMPLETED' | 'FAILED' }) =>
      adminAPI.updateWithdrawalStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWithdrawals'] });
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Une erreur est survenue.');
    }
  });

  const handleUpdateStatus = (id: string, status: 'COMPLETED' | 'FAILED') => {
    const title = status === 'COMPLETED' ? 'Approuver le retrait' : 'Rejeter le retrait';
    const message = status === 'COMPLETED' 
      ? 'Avez-vous bien envoyé l\'argent à l\'artiste ?' 
      : 'Voulez-vous vraiment rejeter cette demande ? L\'argent sera recrédité à l\'artiste.';
    
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      { 
        text: 'Confirmer', 
        style: status === 'FAILED' ? 'destructive' : 'default',
        onPress: () => updateMutation.mutate({ id, status })
      }
    ]);
  };

  const withdrawals = response?.data?.data || [];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Demandes de Retrait</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#FF5A00" style={{ marginTop: 100 }} />
        ) : withdrawals.length === 0 ? (
          <Text style={styles.emptyText}>Aucune demande de retrait pour le moment.</Text>
        ) : (
          withdrawals.map((w: any) => (
            <View key={w.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.artistName}>{w.artist.stageName}</Text>
                <View style={[
                  styles.statusBadge, 
                  w.status === 'COMPLETED' ? styles.statusSuccess : 
                  w.status === 'FAILED' ? styles.statusError : styles.statusPending
                ]}>
                  <Text style={styles.statusText}>
                    {w.status === 'COMPLETED' ? 'Terminé' : w.status === 'FAILED' ? 'Rejeté' : 'En attente'}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.amount}>{w.amount.toLocaleString()} FCFA</Text>
              
              <View style={styles.infoRow}>
                <Ionicons name="card" size={16} color="#888" />
                <Text style={styles.infoText}>{w.paymentMethod} - {w.paymentDetails}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Ionicons name="time" size={16} color="#888" />
                <Text style={styles.infoText}>{new Date(w.createdAt).toLocaleDateString()} à {new Date(w.createdAt).toLocaleTimeString()}</Text>
              </View>

              {/* Actions */}
              {(w.status === 'PENDING' || w.status === 'PROCESSING') && (
                <View style={styles.actionsContainer}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleUpdateStatus(w.id, 'FAILED')}
                    disabled={updateMutation.isPending}
                  >
                    <Ionicons name="close-circle" size={20} color="#FFF" />
                    <Text style={styles.btnText}>Rejeter</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => handleUpdateStatus(w.id, 'COMPLETED')}
                    disabled={updateMutation.isPending}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.btnText}>Approuver</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
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
  emptyText: { color: '#888', textAlign: 'center', marginTop: 50 },
  
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  artistName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPending: { backgroundColor: '#FF950033' },
  statusSuccess: { backgroundColor: '#34C75933' },
  statusError: { backgroundColor: '#FF3B3033' },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  
  amount: { color: '#FF5A00', fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoText: { color: '#888', fontSize: 14, marginLeft: 8 },
  
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    flex: 0.48,
  },
  rejectBtn: { backgroundColor: '#FF3B30' },
  approveBtn: { backgroundColor: '#34C759' },
  btnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8 },
});

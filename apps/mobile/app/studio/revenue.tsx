import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { artistsAPI } from '../../src/lib/api';

export default function StudioRevenueScreen() {
  const queryClient = useQueryClient();
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');

  // Dashboard for total earnings & pending payout
  const { data: dashData, isLoading: isLoadingDash } = useQuery({
    queryKey: ['artist-dashboard'],
    queryFn: () => artistsAPI.getDashboard(),
  });

  const { data: withdrawalsData, isLoading: isLoadingWithdrawals } = useQuery({
    queryKey: ['artist-withdrawals'],
    queryFn: () => artistsAPI.getWithdrawals(),
  });

  const withdrawMutation = useMutation({
    mutationFn: (data: { amount: number; paymentMethod: string; paymentDetails: string }) => artistsAPI.requestWithdrawal(data),
    onSuccess: () => {
      Alert.alert('Succès', 'Votre demande de retrait a été envoyée avec succès.');
      setShowWithdrawForm(false);
      setAmount('');
      setPaymentMethod('');
      setPaymentDetails('');
      queryClient.invalidateQueries({ queryKey: ['artist-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de faire la demande.');
    }
  });

  const cancelWithdrawMutation = useMutation({
    mutationFn: (id: string) => artistsAPI.cancelWithdrawal(id),
    onSuccess: () => {
      Alert.alert('Succès', 'Retrait annulé.');
      queryClient.invalidateQueries({ queryKey: ['artist-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['artist-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || "Impossible d'annuler.");
    }
  });

  const handleCancelWithdrawal = (id: string) => {
    Alert.alert(
      'Annuler le retrait',
      'Êtes-vous sûr de vouloir annuler cette demande de retrait ? Le montant sera recrédité sur votre solde.',
      [
        { text: 'Non', style: 'cancel' },
        { text: 'Oui, annuler', style: 'destructive', onPress: () => cancelWithdrawMutation.mutate(id) }
      ]
    );
  };

  const stats = dashData?.data?.data?.stats;
  const withdrawals = withdrawalsData?.data?.data || [];

  const totalEarnings = stats?.totalEarnings || 0;
  
  // Calculate true available balance based on how we did it in backend:
  // trueTotalEarnings - sum(amount for COMPLETED/PROCESSING/PENDING withdrawals)
  // We can just rely on the withdrawals array to sum it up.
  const totalWithdrawnOrPending = withdrawals
    .filter((w: any) => ['COMPLETED', 'PROCESSING', 'PENDING'].includes(w.status))
    .reduce((sum: number, w: any) => sum + w.amount, 0);

  const pendingAmount = withdrawals
    .filter((w: any) => ['PROCESSING', 'PENDING'].includes(w.status))
    .reduce((sum: number, w: any) => sum + w.amount, 0);

  const availableBalance = Math.max(0, totalEarnings - totalWithdrawnOrPending);

  const handleRequestWithdrawal = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 500) {
      return Alert.alert('Erreur', 'Le montant minimum est de 500.');
    }
    if (amountNum > availableBalance) {
      return Alert.alert('Erreur', 'Solde disponible insuffisant.');
    }
    if (!paymentMethod.trim() || !paymentDetails.trim()) {
      return Alert.alert('Erreur', 'Veuillez remplir tous les champs de paiement.');
    }
    withdrawMutation.mutate({ amount: amountNum, paymentMethod, paymentDetails });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#10B981';
      case 'PROCESSING': return '#3B82F6';
      case 'PENDING': return '#F59E0B';
      case 'FAILED': return '#EF4444';
      default: return '#888';
    }
  };
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Terminé';
      case 'PROCESSING': return 'En cours';
      case 'PENDING': return 'En attente';
      case 'FAILED': return 'Échoué';
      default: return status;
    }
  };

  const renderWithdrawalItem = ({ item }: { item: any }) => (
    <View style={styles.withdrawalCard}>
      <View style={styles.withdrawalLeft}>
        <Text style={styles.withdrawalAmount}>{item.amount} {item.currency || 'XOF'}</Text>
        <Text style={styles.withdrawalDate}>{new Date(item.createdAt).toLocaleDateString()} • {item.paymentMethod}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}22` }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{getStatusLabel(item.status)}</Text>
        </View>
        {item.status === 'PENDING' && (
          <TouchableOpacity 
            onPress={() => handleCancelWithdrawal(item.id)}
            style={{ paddingHorizontal: 4, paddingVertical: 2 }}
          >
            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Annuler</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Revenus & Retraits</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={withdrawals}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* Balance Cards */}
            <View style={styles.balanceContainer}>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Solde Disponible</Text>
                <Text style={styles.balanceAmount}>{availableBalance.toLocaleString()} XOF</Text>
              </View>
              <View style={styles.balanceRow}>
                <View style={styles.subBalanceCard}>
                  <Text style={styles.subBalanceLabel}>Généré au total</Text>
                  <Text style={styles.subBalanceAmount}>{totalEarnings.toLocaleString()} XOF</Text>
                </View>
                <View style={styles.subBalanceCard}>
                  <Text style={styles.subBalanceLabel}>En attente</Text>
                  <Text style={styles.subBalanceAmount}>{pendingAmount.toLocaleString()} XOF</Text>
                </View>
              </View>
            </View>

            {/* Withdraw Action */}
            {!showWithdrawForm ? (
              <TouchableOpacity 
                style={[styles.withdrawBtn, availableBalance < 500 && { opacity: 0.5 }]} 
                onPress={() => setShowWithdrawForm(true)}
                disabled={availableBalance < 500}
              >
                <Ionicons name="cash-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.withdrawBtnText}>Demander un retrait</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.formContainer}>
                <Text style={styles.formTitle}>Nouveau Retrait</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Montant (ex: 5000)"
                  placeholderTextColor="#888"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Moyen de paiement (ex: Orange Money)"
                  placeholderTextColor="#888"
                  value={paymentMethod}
                  onChangeText={setPaymentMethod}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Numéro ou détails du compte"
                  placeholderTextColor="#888"
                  value={paymentDetails}
                  onChangeText={setPaymentDetails}
                />
                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowWithdrawForm(false)}>
                    <Text style={styles.cancelBtnText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.submitBtn} 
                    onPress={handleRequestWithdrawal}
                    disabled={withdrawMutation.isPending}
                  >
                    {withdrawMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>Confirmer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>Historique des retraits</Text>
            {withdrawals.length === 0 && !isLoadingWithdrawals && (
              <Text style={styles.emptyText}>Aucun retrait effectué pour le moment.</Text>
            )}
          </View>
        }
        renderItem={renderWithdrawalItem}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  
  listContent: { paddingBottom: 32 },
  content: { padding: 16 },
  
  balanceContainer: { marginBottom: 24 },
  balanceCard: {
    backgroundColor: '#10B98115',
    borderWidth: 1,
    borderColor: '#10B98144',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabel: { color: '#10B981', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  balanceAmount: { color: '#FFF', fontSize: 36, fontWeight: '800' },
  
  balanceRow: { flexDirection: 'row', gap: 12 },
  subBalanceCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  subBalanceLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  subBalanceAmount: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  withdrawBtn: {
    flexDirection: 'row',
    backgroundColor: '#FF5A00',
    padding: 16,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  withdrawBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  formContainer: {
    backgroundColor: '#141414',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 32,
  },
  formTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#FFF',
    padding: 12,
    marginBottom: 12,
  },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { padding: 12, borderRadius: 8, backgroundColor: '#222' },
  cancelBtnText: { color: '#FFF', fontWeight: '600' },
  submitBtn: { padding: 12, borderRadius: 8, backgroundColor: '#10B981', minWidth: 100, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontWeight: '700' },

  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  emptyText: { color: '#888', fontSize: 14, fontStyle: 'italic' },
  
  withdrawalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  withdrawalLeft: { flex: 1 },
  withdrawalAmount: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  withdrawalDate: { color: '#888', fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
});

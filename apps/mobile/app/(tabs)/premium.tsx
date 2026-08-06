import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscriptionsAPI } from '../../src/lib/api';
import { useToast } from '../../src/components/ToastContext';
import { useAuthStore } from '../../src/stores';

interface Tier {
  tier: string;
  priceTokens: number;
  quota: number;
  features: string[];
}

interface UserData {
  id: string;
  tokenBalance: number;
  subscription?: {
    tier: string;
    status: string;
    currentPeriodEnd: string;
    paidStreamsUsed: number;
  };
}

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user) as any;
  const checkAuth = useAuthStore((state) => state.checkAuth);
  
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [password, setPassword] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const tiersRes = await subscriptionsAPI.getTiers();
      setTiers(tiersRes.data.data);
      await checkAuth();
    } catch (error) {
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const promptSubscribe = (tier: Tier) => {
    if (!user) return;
    if (user.tokenBalance < tier.priceTokens) {
      showToast('Solde de jetons insuffisant. Veuillez recharger votre compte.', 'error');
      return;
    }
    setSelectedTier(tier);
    setPassword('');
    setShowModal(true);
  };

  const confirmSubscribe = async () => {
    if (!selectedTier || !password.trim()) {
      showToast('Veuillez entrer votre mot de passe (ou CONFIRMER)', 'error');
      return;
    }

    try {
      setProcessing(selectedTier.tier);
      const res = await subscriptionsAPI.subscribe(selectedTier.tier as any, password.trim());
      await checkAuth(); // Le socket peut aussi le faire, mais on force pour la réactivité directe
      showToast(res.data.message || 'Abonnement activé avec succès !', 'success');
      setShowModal(false);
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || 'Erreur lors de la souscription';
      showToast(msg, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async () => {
    try {
      setProcessing('CANCEL');
      const res = await subscriptionsAPI.cancel();
      showToast(res.data.message, 'success');
      fetchData();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Erreur', 'error');
    } finally {
      setProcessing(null);
    }
  };

  if (loading && !tiers.length) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FF5A00" />
      </View>
    );
  }

  const activeSub = user?.subscription;
  const isSubActive = activeSub && activeSub.status === 'ACTIVE' && activeSub.tier !== 'FREE';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Premium</Text>
          <View style={styles.balanceContainer}>
            <Ionicons name="diamond" size={16} color="#FFD700" />
            <Text style={styles.balanceText}>{user?.tokenBalance || 0} Jetons</Text>
          </View>
        </View>

        {isSubActive && (
          <View style={styles.activeSubCard}>
            <LinearGradient colors={['#2A2A2A', '#1F1F1F']} style={styles.gradientCard}>
              <View style={styles.activeSubHeader}>
                <Ionicons name="star" size={24} color="#FFD700" />
                <Text style={styles.activeSubTitle}>Abonnement Actuel</Text>
              </View>
              <Text style={styles.activeSubTier}>{activeSub.tier}</Text>
              <Text style={styles.activeSubDetail}>
                Expire le : {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}
              </Text>
              <Text style={styles.activeSubDetail}>
                Quota restant : {
                  activeSub.tier === 'PREMIUM_PLUS' 
                    ? (500 - (activeSub.paidStreamsUsed || 0))
                    : (50 - (activeSub.paidStreamsUsed || 0))
                } écoutes 
                ({activeSub.paidStreamsUsed || 0} utilisées)
              </Text>
              
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={processing === 'CANCEL'}>
                {processing === 'CANCEL' ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.cancelBtnText}>Désactiver le renouvellement</Text>
                )}
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {!isSubActive && <Text style={styles.subtitle}>Découvrez nos offres</Text>}

        {!isSubActive && tiers.map((tier) => (
          <View key={tier.tier} style={styles.tierCard}>
            <LinearGradient
              colors={tier.tier === 'PREMIUM_PLUS' ? ['#FF5A00', '#FF2A00'] : ['#333333', '#111111']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tierGradient}
            >
              <View style={styles.tierHeader}>
                <Text style={styles.tierName}>{tier.tier.replace('_', ' ')}</Text>
                <Text style={styles.tierPrice}>{tier.priceTokens} Jetons<Text style={styles.tierPricePeriod}> / mois</Text></Text>
              </View>

              <View style={styles.featuresList}>
                {tier.features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={tier.tier === 'PREMIUM_PLUS' ? '#FFF' : '#FF5A00'} />
                    <Text style={[styles.featureText, tier.tier === 'PREMIUM_PLUS' && { color: '#FFF' }]}>{feature}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.subscribeBtn,
                  tier.tier === 'PREMIUM_PLUS' ? styles.subscribeBtnLight : styles.subscribeBtnOrange
                ]}
                onPress={() => promptSubscribe(tier)}
                disabled={processing !== null}
              >
                {processing === tier.tier ? (
                  <ActivityIndicator size="small" color={tier.tier === 'PREMIUM_PLUS' ? '#FF5A00' : '#FFF'} />
                ) : (
                  <Text style={[
                    styles.subscribeBtnText,
                    tier.tier === 'PREMIUM_PLUS' ? { color: '#FF5A00' } : { color: '#FFF' }
                  ]}>
                    S'abonner
                  </Text>
                )}
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ))}

      </ScrollView>

      {/* Password Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Validation de l'achat</Text>
            <Text style={styles.modalSubtitle}>
              Vous êtes sur le point de dépenser {selectedTier?.priceTokens} jetons.
            </Text>
            <Text style={styles.modalInstruction}>
              Veuillez entrer votre mot de passe pour confirmer l'achat. (Si vous êtes connecté via Google, tapez "CONFIRMER")
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="Mot de passe ou CONFIRMER"
              placeholderTextColor="#666"
              secureTextEntry={password !== 'CONFIRMER'} 
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowModal(false)} disabled={processing !== null}>
                <Text style={styles.modalBtnTextCancel}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={confirmSubscribe} disabled={processing !== null}>
                {processing ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalBtnTextConfirm}>Acheter</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F1F',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  balanceText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 14,
  },
  activeSubCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  activeSubTitle: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  activeSubTier: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  activeSubDetail: {
    color: '#AAA',
    fontSize: 14,
    marginBottom: 4,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  tierCard: {
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
  },
  tierGradient: {
    padding: 24,
  },
  tierHeader: {
    marginBottom: 20,
  },
  tierName: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tierPrice: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
  },
  tierPricePeriod: {
    fontSize: 16,
    fontWeight: 'normal',
    opacity: 0.8,
  },
  featuresList: {
    marginBottom: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: '#DDDDDD',
    fontSize: 15,
  },
  subscribeBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnOrange: {
    backgroundColor: '#FF5A00',
  },
  subscribeBtnLight: {
    backgroundColor: '#FFFFFF',
  },
  subscribeBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1F1F1F',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#FFD700',
    fontSize: 16,
    marginBottom: 12,
  },
  modalInstruction: {
    color: '#AAA',
    fontSize: 14,
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#0A0A0A',
    color: '#FFF',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  modalBtnConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FF5A00',
    minWidth: 90,
    alignItems: 'center',
  },
  modalBtnTextCancel: {
    color: '#FFF',
    fontWeight: '600',
  },
  modalBtnTextConfirm: {
    color: '#FFF',
    fontWeight: '600',
  },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useStripe } from '@stripe/stripe-react-native';
import { paymentsAPI, purchasesAPI } from '../src/lib/api';
import { useAuthStore } from '../src/stores';
import { CURRENCIES_CONFIG, formatCurrency } from '../src/lib/currency';
import type { SupportedCurrency } from '@kephale/types';

const CURRENCY_OPTIONS: { code: SupportedCurrency; label: string; symbol: string }[] = [
  { code: 'XOF', label: 'FCFA (UEMOA)', symbol: 'FCFA' },
  { code: 'XAF', label: 'FCFA (CEMAC)', symbol: 'FCFA' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'USD', label: 'Dollar US', symbol: '$' },
  { code: 'GNF', label: 'Franc Guinéen', symbol: 'GNF' },
  { code: 'CDF', label: 'Franc Congolais', symbol: 'CDF' },
  { code: 'CAD', label: 'Dollar Canadien', symbol: 'CA$' },
  { code: 'GBP', label: 'Livre Sterling', symbol: '£' },
  { code: 'NGN', label: 'Naira Nigérian', symbol: '₦' },
];

export default function BuyTokensScreen() {
  const { user, checkAuth } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>('XOF');
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<'CINETPAY' | 'STRIPE'>('CINETPAY');

  const { data: packsData, isLoading } = useQuery({
    queryKey: ['token-packs', selectedCurrency],
    queryFn: () => paymentsAPI.getTokenPacks(selectedCurrency),
  });

  const packs = packsData?.data?.data || [];

  const handlePurchase = async () => {
    if (!selectedPack) return;

    try {
      setIsProcessing(true);

      const response = await paymentsAPI.buyTokens(
        selectedPack,
        selectedCurrency,
        paymentProvider
      );

      const resData = response.data?.data || response.data;

      // 1. Cas Mode Simulation / Sandbox (mode développement sans provider configuré)
      if (resData?.isFakeTest) {
        await checkAuth();
        Alert.alert(
          'Recharge effectuée (Mode Test)',
          `Votre compte a bien été crédité de ${resData.tokens} jetons.\n\nNouveau solde : ${resData.newBalance} Jetons.`,
          [
            {
              text: 'Continuer',
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }

      // 2. Cas Stripe (Carte bancaire)
      if (resData?.clientSecret) {
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: resData.clientSecret,
          merchantDisplayName: 'Kephale',
          style: 'alwaysDark',
        });

        if (initError) {
          throw new Error(initError.message);
        }

        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === 'Canceled') {
            return; // Annulation volontaire par l'utilisateur
          }
          throw new Error(presentError.message);
        }

        await checkAuth();
        Alert.alert(
          'Paiement validé !',
          `Félicitations, votre recharge de ${resData.tokens || ''} jetons est confirmée.`,
          [{ text: 'Super !', onPress: () => router.back() }]
        );
        return;
      }

      // 3. Cas CinetPay / Mobile Money (URL de paiement Web)
      const paymentUrl = resData?.paymentUrl;

      if (!paymentUrl) {
        throw new Error(resData?.message || 'Lien de paiement non reçu');
      }

      const result = await WebBrowser.openAuthSessionAsync(
        paymentUrl,
        'kephale://payment-return'
      );

      if (result.type === 'success' || result.type === 'dismiss') {
        Alert.alert(
          'Paiement initié',
          'Votre compte sera crédité dès confirmation de la transaction par votre opérateur Mobile Money.',
          [
            {
              text: 'Actualiser mon solde',
              onPress: async () => {
                await checkAuth();
              },
            },
          ]
        );
      }
    } catch (err: any) {
      console.error('Erreur achat jetons:', err);
      Alert.alert(
        'Erreur',
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Impossible d\'initialiser le paiement. Veuillez réessayer.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const getPriceFormatted = (price: number) => {
    return formatCurrency(price, selectedCurrency);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recharger mon compte</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Solde actuel & Règle de Parité */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={32} color="#FF5A00" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.balanceLabel}>Solde disponible</Text>
              <Text style={styles.balanceValue}>{user?.tokenBalance || 0} Jetons</Text>
            </View>
          </View>

          <View style={styles.parityBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#10B981" />
            <Text style={styles.parityText}>
              Parité officielle : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>1 Jeton = 10 FCFA</Text> (0,015 €) • Taux anti-perte garanti
            </Text>
          </View>
        </View>

        {/* Sélecteur de Devise */}
        <Text style={styles.sectionTitle}>1. Sélectionnez votre devise de paiement</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.currencyScroll}
          contentContainerStyle={styles.currencyScrollContent}
        >
          {CURRENCY_OPTIONS.map((item) => {
            const isSelected = selectedCurrency === item.code;
            return (
              <TouchableOpacity
                key={item.code}
                style={[styles.currencyChip, isSelected && styles.currencyChipSelected]}
                onPress={() => setSelectedCurrency(item.code)}
                activeOpacity={0.7}
              >
                <View style={[styles.symbolBadge, isSelected && styles.symbolBadgeSelected]}>
                  <Text style={[styles.symbolBadgeText, isSelected && styles.symbolBadgeTextSelected]}>
                    {item.symbol}
                  </Text>
                </View>
                <Text style={[styles.currencyCode, isSelected && styles.currencyCodeSelected]}>
                  {item.code}
                </Text>
                <Text style={[styles.currencyLabel, isSelected && styles.currencyLabelSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sélection du Pack */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>2. Choisissez un Pack de jetons</Text>

        {isLoading ? (
          <ActivityIndicator color="#FF5A00" style={{ marginTop: 30, marginBottom: 30 }} />
        ) : (
          <View style={styles.packsGrid}>
            {packs.map((pack: any) => {
              const isSelected = selectedPack === pack.id;
              return (
                <TouchableOpacity
                  key={pack.id}
                  style={[styles.packCard, isSelected && styles.packCardSelected]}
                  onPress={() => setSelectedPack(pack.id)}
                  activeOpacity={0.8}
                >
                  {pack.isBestValue && (
                    <View style={styles.bestValueBadge}>
                      <Text style={styles.bestValueText}>POPULAIRE</Text>
                    </View>
                  )}
                  
                  <View style={styles.packHeader}>
                    <View style={styles.tokenIconBadge}>
                      <Ionicons name="sparkles" size={18} color="#FF5A00" />
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={styles.packTokens}>{pack.tokens.toLocaleString()}</Text>
                        <Text style={styles.packTokensLabel}>Jetons</Text>
                      </View>
                      <Text style={styles.packName}>{pack.label}</Text>
                    </View>
                  </View>

                  <View style={styles.priceContainer}>
                    <Text style={styles.packPrice}>
                      {pack.formattedPrice || formatCurrency(pack.priceLocal || pack.priceEur, selectedCurrency)}
                    </Text>
                    {selectedCurrency !== 'EUR' && (
                      <Text style={styles.packEquivalent}>
                        ({pack.priceEur.toFixed(2)} €)
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Sélection du mode de paiement */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>3. Mode de règlement</Text>

        <View style={styles.providerContainer}>
          <TouchableOpacity
            style={[
              styles.providerCard,
              paymentProvider === 'CINETPAY' && styles.providerCardSelected,
            ]}
            onPress={() => setPaymentProvider('CINETPAY')}
            activeOpacity={0.8}
          >
            <Ionicons name="phone-portrait-outline" size={24} color={paymentProvider === 'CINETPAY' ? '#FF5A00' : '#AAA'} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.providerName}>Mobile Money</Text>
              <Text style={styles.providerDesc}>Orange Money, Wave, MTN MoMo, Moov, Free Money</Text>
            </View>
            {paymentProvider === 'CINETPAY' && (
              <Ionicons name="checkmark-circle" size={22} color="#FF5A00" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.providerCard,
              paymentProvider === 'STRIPE' && styles.providerCardSelected,
            ]}
            onPress={() => setPaymentProvider('STRIPE')}
            activeOpacity={0.8}
          >
            <Ionicons name="card-outline" size={24} color={paymentProvider === 'STRIPE' ? '#FF5A00' : '#AAA'} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.providerName}>Carte Bancaire Internationale</Text>
              <Text style={styles.providerDesc}>Visa, Mastercard, American Express</Text>
            </View>
            {paymentProvider === 'STRIPE' && (
              <Ionicons name="checkmark-circle" size={22} color="#FF5A00" />
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* Footer bouton de paiement */}
      {selectedPack && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.buyBtn}
            onPress={handlePurchase}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="lock-closed" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.buyBtnText}>Payer en {selectedCurrency} en toute sécurité</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1A1A1A', borderRadius: 20,
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 16 },

  balanceCard: {
    backgroundColor: '#141414',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: { color: '#AAA', fontSize: 13, marginBottom: 2 },
  balanceValue: { color: '#FFF', fontSize: 26, fontWeight: '800' },

  parityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 14,
  },
  parityText: {
    color: '#D1D5DB',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },

  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 12 },

  currencyScroll: {
    marginBottom: 8,
  },
  currencyScrollContent: {
    gap: 8,
    paddingRight: 8,
  },
  currencyChip: {
    backgroundColor: '#141414',
    borderWidth: 1.5,
    borderColor: '#262626',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 105,
  },
  currencyChipSelected: {
    borderColor: '#FF5A00',
    backgroundColor: '#26140A',
  },
  symbolBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#222',
    marginBottom: 4,
  },
  symbolBadgeSelected: {
    backgroundColor: 'rgba(255, 90, 0, 0.2)',
  },
  symbolBadgeText: {
    color: '#AAA',
    fontSize: 11,
    fontWeight: '700',
  },
  symbolBadgeTextSelected: {
    color: '#FF5A00',
  },
  currencyCode: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
  },
  currencyCodeSelected: {
    color: '#FF5A00',
  },
  currencyLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 1,
  },
  currencyLabelSelected: {
    color: '#FDBA74',
  },

  packsGrid: { gap: 12 },
  packCard: {
    backgroundColor: '#141414',
    borderWidth: 2,
    borderColor: '#222',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packCardSelected: { borderColor: '#FF5A00', backgroundColor: '#1A1108' },
  bestValueBadge: {
    position: 'absolute', top: -10, left: 16,
    backgroundColor: '#FF5A00', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  bestValueText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  packHeader: { flexDirection: 'row', alignItems: 'center' },
  tokenIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 90, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  packTokens: { color: '#FFF', fontSize: 22, fontWeight: '800', marginRight: 6 },
  packTokensLabel: { color: '#AAA', fontSize: 14, fontWeight: '600' },
  packName: { color: '#777', fontSize: 12, marginTop: 1 },

  priceContainer: { alignItems: 'flex-end' },
  packPrice: { color: '#FF5A00', fontSize: 18, fontWeight: '800' },
  packEquivalent: { color: '#777', fontSize: 11, marginTop: 2 },

  providerContainer: { gap: 10 },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1.5,
    borderColor: '#222',
    borderRadius: 14,
    padding: 14,
  },
  providerCardSelected: {
    borderColor: '#FF5A00',
    backgroundColor: '#1A1108',
  },
  providerName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  providerDesc: { color: '#777', fontSize: 12, marginTop: 2 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#000', padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderColor: '#222',
  },
  buyBtn: {
    backgroundColor: '#FF5A00',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

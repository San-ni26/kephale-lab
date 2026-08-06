import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../stores';
import { calculateTokensForPrice, formatCurrency } from '../lib/currency';

interface PaymentMethodModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (provider: 'TOKEN') => void;
  currency: string;
  price: number;
}

export default function PaymentMethodModal({ visible, onClose, onSelect, currency, price }: PaymentMethodModalProps) {
  const { user } = useAuthStore();
  const tokenBalance = user?.tokenBalance || 0;

  if (!visible) return null;

  // Accurate token calculation with guaranteed directional rounding UP (anti-loss)
  const tokensRequired = calculateTokensForPrice(price, currency);
  const formattedPrice = formatCurrency(price, currency);

  const hasEnoughTokens = tokenBalance >= tokensRequired;

  const handleRecharge = () => {
    onClose();
    router.push('/buy-tokens' as any);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Confirmer l'achat</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.priceContainer}>
             <Text style={styles.originalPrice}>Prix de l'article : {formattedPrice}</Text>
             <Text style={styles.tokenEquivalent}>soit {tokensRequired} Jetons</Text>
          </View>
          
          <View style={styles.balanceContainer}>
             <Ionicons name="wallet-outline" size={20} color="#A0A0A0" />
             <Text style={styles.balanceText}>Votre solde : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{tokenBalance} Jetons</Text></Text>
          </View>

          {hasEnoughTokens ? (
            <TouchableOpacity style={styles.payBtn} onPress={() => onSelect('TOKEN')}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.payBtnText}>Payer {tokensRequired} Jetons</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={styles.errorText}>Vous n'avez pas assez de jetons.</Text>
              <TouchableOpacity style={styles.rechargeBtn} onPress={handleRecharge}>
                <Ionicons name="add-circle-outline" size={24} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.payBtnText}>Recharger mon compte</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  priceContainer: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  originalPrice: { color: '#AAA', fontSize: 14, marginBottom: 4 },
  tokenEquivalent: { color: '#FF5A00', fontSize: 24, fontWeight: '800' },
  
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
  },
  balanceText: { color: '#AAA', fontSize: 15, marginLeft: 8 },
  
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A00',
    borderRadius: 16,
    padding: 16,
  },
  rechargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    padding: 16,
  },
  payBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  errorText: { color: '#EF4444', textAlign: 'center', marginBottom: 12, fontSize: 14 },
});

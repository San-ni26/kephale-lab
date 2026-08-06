import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores';
import { userAPI } from '../lib/api';

const COUNTRIES = [
  { code: '+223', name: 'Mali' },
  { code: '+225', name: "Côte d'Ivoire" },
  { code: '+221', name: 'Sénégal' },
  { code: '+234', name: 'Nigeria' },
  { code: '+227', name: 'Niger' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChangePhoneModal({ visible, onClose }: Props) {
  const { user, checkAuth } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+223');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!phoneNumber) {
      Alert.alert('Erreur', 'Veuillez entrer votre numéro de téléphone.');
      return;
    }

    const lengths: Record<string, number> = {
      '+223': 8, // Mali
      '+225': 10, // CI
      '+221': 9, // Senegal
      '+227': 8, // Niger
      '+234': 10, // Nigeria
    };
    const reqLen = lengths[countryCode] || 8;
    if (phoneNumber.replace(/\s/g, '').length !== reqLen) {
      Alert.alert('Erreur', `Le numéro pour ce pays doit contenir exactement ${reqLen} chiffres.`);
      return;
    }

    setLoading(true);
    try {
      await userAPI.updateProfile({ phoneNumber: `${countryCode}${phoneNumber}` });
      await checkAuth(); // refresh user data
      Alert.alert('Succès', 'Votre numéro de téléphone a été mis à jour.');
      onClose();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'Impossible d\'enregistrer le numéro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.overlay}
        >
          <View style={styles.container}>
            <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.iconContainer}>
              <Ionicons name="call" size={32} color="#FF5A00" />
            </View>
            <Text style={styles.title}>Changer de numéro</Text>
            <Text style={styles.subtitle}>
              Entrez votre nouveau numéro de téléphone.
            </Text>

            <View style={styles.phoneInputContainer}>
              <TouchableOpacity 
                style={styles.countryCodeSelector} 
                onPress={() => setShowCountryPicker(true)}
              >
                <Text style={styles.countryCodeText}>
                  {countryCode}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#FFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TextInput
                style={styles.phoneInput}
                placeholder="Nouveau numéro"
                placeholderTextColor="#A0A0A0"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Enregistrer</Text>}
            </TouchableOpacity>
          </View>

          {showCountryPicker && (
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerContent}>
                <Text style={styles.pickerTitle}>Choisir l'indicatif</Text>
                {COUNTRIES.map(country => (
                  <TouchableOpacity
                    key={country.code}
                    style={styles.countryOption}
                    onPress={() => {
                      setCountryCode(country.code);
                      setShowCountryPicker(false);
                    }}
                  >
                    <Text style={styles.countryOptionText}>{country.name}</Text>
                    <Text style={styles.countryOptionCode}>{country.code}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.pickerCloseBtn} onPress={() => setShowCountryPicker(false)}>
                  <Text style={styles.pickerCloseBtnText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
  },
  closeIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  iconContainer: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255, 90, 0, 0.1)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    marginTop: 16,
  },
  title: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#A0A0A0', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, width: '100%' },
  countryCodeSelector: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2A2A2A', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 16,
  },
  countryCodeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  phoneInput: {
    flex: 1, backgroundColor: '#2A2A2A', color: '#FFFFFF',
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#FF5A00', borderRadius: 30, paddingVertical: 16,
    width: '100%', alignItems: 'center',
  },
  primaryBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  pickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1000,
  },
  pickerContent: {
    backgroundColor: '#1A1A1A', borderRadius: 20, padding: 20, width: '80%', borderWidth: 1, borderColor: '#333',
  },
  pickerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  countryOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#333' },
  countryOptionText: { color: '#FFF', fontSize: 16 },
  countryOptionCode: { color: '#A0A0A0', fontSize: 16 },
  pickerCloseBtn: { marginTop: 20, backgroundColor: '#333', paddingVertical: 12, borderRadius: 30, alignItems: 'center' },
  pickerCloseBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

import { View, Text, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { authAPI } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setErrorMessage("Email manquant.");
    }
  }, [email]);

  async function handleReset() {
    if (!email) {
      setErrorMessage("Email manquant.");
      return;
    }
    if (otp.length < 6) {
      setErrorMessage("Veuillez saisir le code à 6 chiffres.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await authAPI.resetPassword({ email, otp, password });
      setSuccess(true);
    } catch (e: any) {
      setErrorMessage(e?.response?.data?.error?.message || e.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0F0F0F', '#000000']} style={styles.backgroundOverlay} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/(auth)/welcome')} style={styles.backBtn}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          
          {success ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={60} color="#34C759" />
              <Text style={styles.successText}>
                Votre mot de passe a été réinitialisé avec succès.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { width: '100%', marginTop: 20 }]} onPress={() => router.replace('/(auth)/welcome')}>
                <Text style={styles.primaryBtnText}>Se connecter</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Veuillez créer un nouveau mot de passe pour votre compte.
              </Text>

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                  <TouchableOpacity style={styles.errorCloseBtn} onPress={() => setErrorMessage(null)}>
                    <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder="Code à 6 chiffres"
                placeholderTextColor="#A0A0A0"
                value={otp}
                onChangeText={(val) => {
                  setOtp(val);
                  setErrorMessage(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TextInput
                style={styles.input}
                placeholder="Nouveau mot de passe"
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setErrorMessage(null);
                }}
                secureTextEntry
              />

              <TextInput
                style={styles.input}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor="#A0A0A0"
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  setErrorMessage(null);
                }}
                secureTextEntry
              />

              <TouchableOpacity 
                style={[styles.primaryBtn, !email && styles.disabledBtn]} 
                onPress={handleReset} 
                disabled={loading || !email}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Réinitialiser</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundOverlay: { position: 'absolute', width: '100%', height: '100%' },
  header: { padding: 16, zIndex: 10, alignItems: 'flex-end' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 32, justifyContent: 'center', paddingBottom: 60 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFF', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#A0A0A0', marginBottom: 32, lineHeight: 22 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 16, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  primaryBtn: { backgroundColor: '#FF5A00', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  disabledBtn: { backgroundColor: '#666', opacity: 0.5 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 59, 48, 0.15)', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  errorBannerText: { flex: 1, color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  errorCloseBtn: { padding: 4, marginLeft: 8 },
  successContainer: { alignItems: 'center', marginTop: 40, gap: 20 },
  successText: { color: '#FFF', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});

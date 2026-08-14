import { View, Text, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { router } from 'expo-router';
import { authAPI } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleReset() {
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      setErrorMessage("Veuillez saisir votre adresse email.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await authAPI.forgotPassword(emailTrimmed);
      router.push({ pathname: '/(auth)/reset-password', params: { email: emailTrimmed } });
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Mot de passe oublié</Text>
          
          {success ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={60} color="#34C759" />
              <Text style={styles.successText}>
                Redirection en cours...
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Saisissez votre adresse email pour recevoir un lien de réinitialisation.
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
                placeholder="Adresse Email"
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  setErrorMessage(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleReset} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Envoyer le lien</Text>
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
  header: { padding: 16, zIndex: 10 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 32, justifyContent: 'center', paddingBottom: 60 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFF', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#A0A0A0', marginBottom: 32, lineHeight: 22 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 16, fontSize: 16, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  primaryBtn: { backgroundColor: '#FF5A00', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 59, 48, 0.15)', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  errorBannerText: { flex: 1, color: '#FF6B6B', fontSize: 14, fontWeight: '500' },
  errorCloseBtn: { padding: 4, marginLeft: 8 },
  successContainer: { alignItems: 'center', marginTop: 40, gap: 20 },
  successText: { color: '#FFF', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});

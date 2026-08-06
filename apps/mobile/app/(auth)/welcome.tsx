import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/index';
import { authAPI } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

function extractErrorMessage(error: any): string {
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  if (error?.response?.data?.message) {
    return Array.isArray(error.response.data.message)
      ? error.response.data.message.join(', ')
      : error.response.data.message;
  }
  if (error?.response?.data?.error && typeof error.response.data.error === 'string') {
    return error.response.data.error;
  }
  if (error?.message) {
    if (error.message.includes('Network Error') || error.message.includes('ECONNREFUSED')) {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion Internet ou l\'état du serveur.';
    }
    return error.message;
  }
  return 'Une erreur inattendue est survenue lors de l\'authentification.';
}

export default function WelcomeScreen() {
  const { setAuth, isAuthenticated } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+223'); // Default Mali
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const COUNTRIES = [
    { code: '+223', name: 'Mali' },
    { code: '+225', name: "Côte d'Ivoire" },
    { code: '+221', name: 'Sénégal' },
    { code: '+234', name: 'Nigeria' },
    { code: '+227', name: 'Niger' },
  ];

  const isConfigured = Constants.expoConfig?.extra?.googleClientId && Constants.expoConfig?.extra?.googleClientId !== '';

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: isConfigured ? Constants.expoConfig?.extra?.googleClientId : 'dummy',
    iosClientId: isConfigured ? Constants.expoConfig?.extra?.googleClientId : 'dummy',
    androidClientId: isConfigured ? Constants.expoConfig?.extra?.googleClientId : 'dummy',
    redirectUri: AuthSession.makeRedirectUri({ useProxy: true, projectNameForProxy: '@paulkone/kephale' }),
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token, access_token } = response.params;
      handleGoogleLogin(id_token || access_token);
    } else if (response?.type === 'error') {
      setErrorMessage('Impossible de se connecter avec Google.');
      Alert.alert('Erreur Google', 'Impossible de finaliser la connexion Google.');
    }
  }, [response]);

  async function handleGoogleLogin(token: string) {
    if (!token) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await authAPI.loginWithGoogle(token);
      const { user, accessToken, refreshToken, expiresIn } = res.data.data;
      setAuth(user, { accessToken, refreshToken, expiresIn });
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = extractErrorMessage(e);
      setErrorMessage(msg);
      Alert.alert('Échec de la connexion Google', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleLocalAuth() {
    setErrorMessage(null);

    const emailTrimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailTrimmed) {
      const msg = 'Veuillez saisir votre adresse email.';
      setErrorMessage(msg);
      Alert.alert('Champ obligatoire', msg);
      return;
    }

    if (!emailRegex.test(emailTrimmed)) {
      const msg = 'Le format de l\'adresse email est invalide (ex: utilisateur@domaine.com).';
      setErrorMessage(msg);
      Alert.alert('Email invalide', msg);
      return;
    }

    if (!password) {
      const msg = 'Veuillez saisir votre mot de passe.';
      setErrorMessage(msg);
      Alert.alert('Champ obligatoire', msg);
      return;
    }

    if (password.length < 6) {
      const msg = 'Le mot de passe doit comporter au moins 6 caractères.';
      setErrorMessage(msg);
      Alert.alert('Mot de passe trop court', msg);
      return;
    }

    if (!isLogin) {
      if (!name.trim() || name.trim().length < 2) {
        const msg = 'Veuillez renseigner votre nom complet (au moins 2 caractères).';
        setErrorMessage(msg);
        Alert.alert('Nom incomplet', msg);
        return;
      }

      if (!username.trim() || !/^@[a-z0-9_]{2,}$/.test(username.trim())) {
        const msg = 'Le nom d\'utilisateur doit commencer par @ et comporter au moins 2 caractères alphanumériques ou underscores (ex: @jean_dupont).';
        setErrorMessage(msg);
        Alert.alert('Nom d\'utilisateur invalide', msg);
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
      const cleanPhone = phoneNumber.replace(/\s/g, '');
      if (!cleanPhone || cleanPhone.length !== reqLen) {
        const msg = `Le numéro de téléphone pour ${COUNTRIES.find(c => c.code === countryCode)?.name || 'ce pays'} doit comporter exactement ${reqLen} chiffres.`;
        setErrorMessage(msg);
        Alert.alert('Numéro invalide', msg);
        return;
      }
    }

    setLoading(true);
    try {
      let res;
      if (isLogin) {
        res = await authAPI.loginWithEmail({ email: emailTrimmed, password });
      } else {
        res = await authAPI.registerWithEmail({
          email: emailTrimmed,
          password,
          name: name.trim(),
          username: username.trim(),
          phoneNumber: `${countryCode}${phoneNumber.replace(/\s/g, '')}`,
        });
      }
      const { user, accessToken, refreshToken, expiresIn } = res.data.data;
      setAuth(user, { accessToken, refreshToken, expiresIn });
      router.replace('/(tabs)');
    } catch (error: any) {
      const msg = extractErrorMessage(error);
      setErrorMessage(msg);
      Alert.alert(isLogin ? 'Échec de la connexion' : 'Échec de l\'inscription', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/auth_bg.png')} style={styles.backgroundImage} />
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.7)', '#000000']} style={styles.backgroundOverlay} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Logo */}
            <View style={styles.logoSection}>
              <View style={styles.logoCircle}>
                <Ionicons name="musical-notes" size={40} color="#FFFFFF" />
              </View>
              <Text style={styles.appName}>Kephale</Text>
              <Text style={styles.tagline}>La musique africaine, sans frontières</Text>
            </View>

            {/* Error Banner */}
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
                <TouchableOpacity onPress={() => setErrorMessage(null)} style={styles.errorCloseBtn}>
                  <Ionicons name="close" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}

            {/* Form */}
            <View style={styles.formContainer}>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[styles.toggleBtn, isLogin && styles.toggleBtnActive]}
                  onPress={() => {
                    setIsLogin(true);
                    setErrorMessage(null);
                  }}
                >
                  <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>Connexion</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, !isLogin && styles.toggleBtnActive]}
                  onPress={() => {
                    setIsLogin(false);
                    setErrorMessage(null);
                  }}
                >
                  <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>Inscription</Text>
                </TouchableOpacity>
              </View>

              {!isLogin && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Nom complet"
                    placeholderTextColor="#A0A0A0"
                    value={name}
                    onChangeText={(val) => {
                      setName(val);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="@nomdutilisateur"
                    placeholderTextColor="#A0A0A0"
                    value={username}
                    onChangeText={(text) => {
                      let formatted = text.toLowerCase().replace(/[^a-z0-9_@]/g, '');
                      if (formatted.length > 0 && !formatted.startsWith('@')) {
                        formatted = '@' + formatted;
                      }
                      setUsername(formatted);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
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
                      placeholder="Numéro de téléphone"
                      placeholderTextColor="#A0A0A0"
                      value={phoneNumber}
                      onChangeText={(val) => {
                        setPhoneNumber(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      keyboardType="phone-pad"
                    />
                  </View>
                </>
              )}

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                secureTextEntry
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleLocalAuth} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{isLogin ? 'Se connecter' : 'Créer un compte'}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OU</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google CTA */}
            <View style={styles.ctaSection}>
              <TouchableOpacity
                style={[styles.googleBtn, (!isConfigured && !__DEV__) && styles.disabled]}
                onPress={() => {
                  if (isConfigured && request) {
                    promptAsync();
                  } else {
                    Alert.alert('Information Google Sign-In', 'Le service Google Sign-In nécessite la configuration du Client ID.');
                  }
                }}
                disabled={loading}
              >
                <Ionicons name="logo-google" size={20} color="#000000" />
                <Text style={styles.googleBtnText}>Continuer avec Google</Text>
              </TouchableOpacity>

              <Text style={styles.terms}>
                En continuant, tu acceptes nos{' '}
                <Text style={styles.link}>Conditions d'utilisation</Text> et notre{' '}
                <Text style={styles.link}>Politique de confidentialité</Text>
              </Text>
            </View>

          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      {showCountryPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choisir l'indicatif</Text>
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
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowCountryPicker(false)}>
              <Text style={styles.modalCloseBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  backgroundOverlay: { position: 'absolute', width: '100%', height: '100%' },
  safeArea: { flex: 1, paddingTop: 40 },
  scrollContent: { paddingHorizontal: 32, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },

  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF5A00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: { fontSize: 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  tagline: { fontSize: 16, color: '#A0A0A0', marginTop: 8, textAlign: 'center' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  errorBannerText: {
    flex: 1,
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorCloseBtn: {
    padding: 4,
    marginLeft: 8,
  },

  formContainer: { gap: 16, marginBottom: 30 },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 30,
    padding: 4,
    marginBottom: 8
  },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 26, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FF5A00' },
  toggleText: { color: '#A0A0A0', fontWeight: '600', fontSize: 14 },
  toggleTextActive: { color: '#FFFFFF' },

  input: {
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  countryCodeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  primaryBtn: {
    backgroundColor: '#FF5A00',
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },

  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#333333' },
  dividerText: { color: '#A0A0A0', paddingHorizontal: 16, fontWeight: '600' },

  ctaSection: { gap: 20 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingVertical: 18,
    gap: 12,
  },
  disabled: { opacity: 0.6 },
  googleBtnText: { fontSize: 16, fontWeight: 'bold', color: '#000000' },
  terms: { textAlign: 'center', fontSize: 12, color: '#6B7280', lineHeight: 20 },
  link: { color: '#FF5A00', fontWeight: '600' },
  
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    width: '80%',
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  countryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  countryOptionText: { color: '#FFF', fontSize: 16 },
  countryOptionCode: { color: '#A0A0A0', fontSize: 16 },
  modalCloseBtn: {
    marginTop: 20,
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
  },
  modalCloseBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

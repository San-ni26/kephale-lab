import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/index';
import { artistsAPI } from '../../src/lib/api';
import { uploadToS3 } from '../../src/lib/upload';

const GENRES = [
  'Afrobeat', 'Mandingue', 'Hip-Hop', 'R&B', 'Reggae', 'Pop',
  'Gospel', 'Coupé-Décalé', 'Zouglou', 'Jazz', 'Trap', 'Électro',
  'Afro-Pop', 'Balafon', 'Griot', 'Wassoulou', 'Sénégambien',
];

const COUNTRIES = [
  { code: 'ML', name: 'Mali' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'GN', name: 'Guinée' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'GH', name: 'Ghana' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'CM', name: 'Cameroun' },
  { code: 'FR', name: 'France' },
];

const TOTAL_STEPS = 4;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepIndicator}>
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <View style={[styles.stepDot, i < current && styles.stepDotDone, i === current && styles.stepDotActive]}>
            {i < current
              ? <Ionicons name="checkmark" size={12} color="#FFF" />
              : <Text style={[styles.stepDotText, i === current && styles.stepDotTextActive]}>{i + 1}</Text>
            }
          </View>
          {i < total - 1 && <View style={[styles.stepLine, i < current && styles.stepLineDone]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function BecomeArtistScreen() {
  const { user, updateUser } = useAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [stageName, setStageName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [country, setCountry] = useState('ML');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const toggleGenre = (g: string) => {
    setSelectedGenres(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 4 ? [...prev, g] : prev
    );
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled) setCoverUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (stageName.length < 2) {
      Alert.alert('Erreur', 'Le nom de scène doit faire au moins 2 caractères.');
      return;
    }

    setLoading(true);
    try {
      let avatarUrl: string | undefined;
      let coverUrl: string | undefined;

      if (avatarUri) {
        const uploadRes = await uploadToS3({
          uri: avatarUri,
          type: 'image',
          filename: `avatar_${Date.now()}.jpg`,
        });
        avatarUrl = uploadRes.publicUrl;
      }

      if (coverUri) {
        const uploadRes = await uploadToS3({
          uri: coverUri,
          type: 'image',
          filename: `banner_${Date.now()}.jpg`,
        });
        coverUrl = uploadRes.publicUrl;
      }

      const response = await artistsAPI.createProfile({
        stageName: stageName.trim(),
        bio: bio.trim() || undefined,
        genre: selectedGenres,
        country,
        avatar: avatarUrl,
        coverImage: coverUrl,
        instagramUrl: instagramUrl.trim() || undefined,
        twitterUrl: twitterUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });

      if (response.data.success) {
        if (response.data.tokens) {
          const currentUser = useAuthStore.getState().user;
          useAuthStore.getState().setAuth(
            { 
              ...currentUser!, 
              role: 'ARTIST',
              name: stageName.trim(),
              ...(avatarUrl ? { avatar: avatarUrl } : {})
            },
            response.data.tokens
          );
        } else {
          updateUser({ 
            role: 'ARTIST',
            name: stageName.trim(),
            ...(avatarUrl ? { avatar: avatarUrl } : {})
          });
        }
        Alert.alert(
          'Bienvenue, Artiste !',
          'Votre profil artiste a été créé avec succès.',
          [{ text: 'Super !', onPress: () => router.replace('/artist-dashboard') }]
        );
      }
    } catch (error: any) {
      Alert.alert('Erreur', error?.response?.data?.error?.message || error?.message || 'Une erreur est survenue lors de la création du profil.');
    } finally {
      setLoading(false);
    }
  };

  const canNext = () => {
    if (step === 0) return stageName.trim().length >= 2;
    if (step === 1) return selectedGenres.length > 0;
    return true;
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else handleSubmit();
  };

  const goBack = () => {
    if (step > 0) setStep(s => s - 1);
    else router.back();
  };

  const stepTitles = [
    'Votre identité artiste',
    'Vos genres musicaux',
    'Votre image',
    'Liens & Confirmation',
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Devenir Artiste</Text>
        <View style={{ width: 36 }} />
      </View>

      <StepIndicator current={step} total={TOTAL_STEPS} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>{stepTitles[step]}</Text>

        {/* ── ÉTAPE 0 : Identité ── */}
        {step === 0 && (
          <View>
            <Text style={styles.desc}>
              Choisissez le nom sous lequel vous serez connu sur Kephale.
            </Text>

            <Text style={styles.label}>Nom de scène *</Text>
            <TextInput
              style={styles.input}
              value={stageName}
              onChangeText={setStageName}
              placeholder="Ex: Salif K., MC Bamako..."
              placeholderTextColor="#555"
              autoCapitalize="words"
              maxLength={60}
            />
            <Text style={styles.charCount}>{stageName.length}/60</Text>

            <Text style={styles.label}>Biographie</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Parlez de votre parcours, vos influences, votre vision..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{bio.length}/500</Text>
          </View>
        )}

        {/* ── ÉTAPE 1 : Genres ── */}
        {step === 1 && (
          <View>
            <Text style={styles.desc}>
              Sélectionnez jusqu'à 4 genres qui décrivent votre musique.
            </Text>
            <View style={styles.genreGrid}>
              {GENRES.map((g) => {
                const selected = selectedGenres.includes(g);
                const maxed = selectedGenres.length >= 4 && !selected;
                return (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genreChip, selected && styles.genreChipSelected, maxed && styles.genreChipDisabled]}
                    onPress={() => !maxed && toggleGenre(g)}
                  >
                    <Text style={[styles.genreText, selected && styles.genreTextSelected]}>{g}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Pays *</Text>
            <View style={styles.countryGrid}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.countryChip, country === c.code && styles.countryChipSelected]}
                  onPress={() => setCountry(c.code)}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={country === c.code ? '#FF5A00' : '#888'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.countryName, country === c.code && styles.countryNameSelected]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── ÉTAPE 2 : Photos ── */}
        {step === 2 && (
          <View>
            <Text style={styles.desc}>
              Ajoutez une photo de profil et une image de couverture pour votre page artiste.
            </Text>

            <Text style={styles.label}>Photo de profil</Text>
            <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person-circle-outline" size={48} color="#444" />
                  <Text style={styles.pickerText}>Ajouter une photo</Text>
                </View>
              )}
              <View style={styles.pickerEditBadge}>
                <Ionicons name="camera" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>

            <Text style={styles.label}>Image de couverture (bannière)</Text>
            <TouchableOpacity style={styles.coverPicker} onPress={pickCover}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverPreview} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={40} color="#444" />
                  <Text style={styles.pickerText}>Ajouter une bannière</Text>
                  <Text style={styles.pickerSubText}>Format 16:9 recommandé</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.optionalNote}>Ces images sont optionnelles — vous pourrez les ajouter plus tard.</Text>
          </View>
        )}

        {/* ── ÉTAPE 3 : Liens + Confirmation ── */}
        {step === 3 && (
          <View>
            <Text style={styles.desc}>
              Optionnel : ajoutez vos réseaux sociaux pour que vos fans puissent vous suivre.
            </Text>

            <View style={styles.socialInput}>
              <Ionicons name="logo-instagram" size={20} color="#E1306C" style={styles.socialIcon} />
              <TextInput
                style={styles.socialField}
                value={instagramUrl}
                onChangeText={setInstagramUrl}
                placeholder="@votrecompte"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.socialInput}>
              <Ionicons name="logo-twitter" size={20} color="#1DA1F2" style={styles.socialIcon} />
              <TextInput
                style={styles.socialField}
                value={twitterUrl}
                onChangeText={setTwitterUrl}
                placeholder="@votrecompte"
                placeholderTextColor="#555"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.socialInput}>
              <Ionicons name="globe-outline" size={20} color="#888" style={styles.socialIcon} />
              <TextInput
                style={styles.socialField}
                value={websiteUrl}
                onChangeText={setWebsiteUrl}
                placeholder="https://votre-site.com"
                placeholderTextColor="#555"
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            {/* Résumé */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Résumé de votre profil</Text>
              {[
                { k: 'Nom de scène', v: stageName },
                { k: 'Pays', v: COUNTRIES.find(c => c.code === country)?.name ?? country },
                { k: 'Genres', v: selectedGenres.join(', ') || '—' },
                { k: 'Photo', v: avatarUri ? '✓ Ajoutée' : '» Ignorée' },
                { k: 'Couverture', v: coverUri ? '✓ Ajoutée' : '» Ignorée' },
              ].map(({ k, v }) => (
                <View key={k} style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>{k}</Text>
                  <Text style={styles.summaryVal} numberOfLines={1}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={styles.termsBox}>
              <Ionicons name="information-circle-outline" size={18} color="#8B5CF6" />
              <Text style={styles.termsText}>
                En créant votre profil, vous acceptez les conditions d'utilisation de Kephale et la politique de contenu artiste.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, (!canNext() || loading) && styles.nextBtnDisabled]}
          onPress={goNext}
          disabled={!canNext() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step < TOTAL_STEPS - 1 ? 'Continuer' : 'Créer mon profil'}
              </Text>
              {step < TOTAL_STEPS - 1 && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 36 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },

  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 30,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { borderColor: '#FF5A00', backgroundColor: '#FF5A0022' },
  stepDotDone: { backgroundColor: '#FF5A00', borderColor: '#FF5A00' },
  stepDotText: { color: '#555', fontSize: 12, fontWeight: '700' },
  stepDotTextActive: { color: '#FF5A00' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#222', marginHorizontal: 6 },
  stepLineDone: { backgroundColor: '#FF5A00' },

  content: { padding: 20, paddingBottom: 40 },

  stepTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  desc: { color: '#888', fontSize: 14, lineHeight: 21, marginBottom: 24 },

  label: { color: '#CCC', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    color: '#FFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 6,
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  charCount: { color: '#555', fontSize: 12, textAlign: 'right', marginBottom: 18 },

  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#141414',
  },
  genreChipSelected: { borderColor: '#FF5A00', backgroundColor: '#FF5A0020' },
  genreChipDisabled: { opacity: 0.35 },
  genreText: { color: '#888', fontSize: 13, fontWeight: '600' },
  genreTextSelected: { color: '#FF5A00' },

  countryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#141414',
    gap: 6,
  },
  countryChipSelected: { borderColor: '#FF5A00', backgroundColor: '#FF5A0020' },
  countryFlag: { fontSize: 18 },
  countryName: { color: '#888', fontSize: 13, fontWeight: '600' },
  countryNameSelected: { color: '#FF5A00' },

  // Image pickers
  avatarPicker: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
    position: 'relative',
  },
  avatarPreview: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#141414',
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  coverPicker: { marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  coverPreview: { width: '100%', height: 180, borderRadius: 14 },
  coverPlaceholder: {
    height: 140,
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerText: { color: '#666', fontSize: 14, fontWeight: '600', marginTop: 8 },
  pickerSubText: { color: '#444', fontSize: 12, marginTop: 4 },
  optionalNote: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 8 },

  // Social links
  socialInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  socialIcon: { marginRight: 10 },
  socialField: { flex: 1, color: '#FFF', fontSize: 15, paddingVertical: 14 },

  summaryBox: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
    marginTop: 16,
  },
  summaryTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  summaryKey: { color: '#888', fontSize: 13 },
  summaryVal: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

  termsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#8B5CF611',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#8B5CF633',
  },
  termsText: { flex: 1, color: '#8B5CF6', fontSize: 12, lineHeight: 18 },

  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A00',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  nextBtnDisabled: { backgroundColor: '#3A1A00', opacity: 0.6 },
  nextBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});

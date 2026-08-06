import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adsAPI, videosAPI, tracksAPI, albumsAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import { hapticFeedback } from '../../src/lib/haptics';
import { VideoThumbnail } from '../../src/components/VideoThumbnail';

const BOOST_PACKAGES = [
  {
    id: 'DISCOVERY',
    title: 'Pack Découverte',
    badge: 'Bronze',
    badgeIcon: 'ribbon-outline' as const,
    badgeColor: '#CD7F32',
    impressions: 1000,
    tokensCost: 50,
    durationDays: 7,
    description: 'Idéal pour tester et amorcer la viralité',
  },
  {
    id: 'TRENDING',
    title: 'Pack Tendance',
    badge: 'Argent',
    badgeIcon: 'ribbon-outline' as const,
    badgeColor: '#C0C0C0',
    impressions: 5000,
    tokensCost: 200,
    durationDays: 14,
    description: 'Fort impact sur les recommandations & le feed',
  },
  {
    id: 'VIRAL',
    title: 'Pack Viral & Hit',
    badge: 'Or',
    badgeIcon: 'trophy-outline' as const,
    badgeColor: '#FFD700',
    impressions: 20000,
    tokensCost: 700,
    durationDays: 30,
    description: 'Diffusion massive prioritaire & conquête de fans',
  },
  {
    id: 'CUSTOM',
    title: 'Pack Sur-Mesure',
    badge: 'Personnalisé',
    badgeIcon: 'options-outline' as const,
    badgeColor: '#E0A96D',
    impressions: 2500,
    tokensCost: 100,
    durationDays: 14,
    description: '1 Jeton = 25 Vues / Écoutes délivrées',
  },
];

const TARGET_COUNTRIES = [
  { code: 'ALL', name: 'Mondial (Tous pays)' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'ML', name: 'Mali' },
  { code: 'CM', name: 'Cameroun' },
  { code: 'FR', name: 'France & Diaspora' },
];


export default function CreateBoostScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ preselectType?: string; preselectId?: string }>();

  const isArtist = user?.role === 'ARTIST' || user?.role === 'ADMIN';

  // State
  const [activeTab, setActiveTab] = useState<'REEL' | 'TRACK' | 'ALBUM' | 'CLIP'>(
    (params.preselectType as any) || 'REEL'
  );
  const [selectedItemId, setSelectedItemId] = useState<string>(params.preselectId || '');
  const [selectedPackage, setSelectedPackage] = useState<string>('TRENDING');
  const [customViews, setCustomViews] = useState<string>('2500');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [ctaText, setCtaText] = useState<string>('Découvrir');

  // Queries for user items
  const { data: reelsRes, isLoading: loadingReels } = useQuery({
    queryKey: ['myVideosReels'],
    queryFn: () => videosAPI.mine({ type: 'SHORT' }),
  });

  const { data: clipsRes, isLoading: loadingClips } = useQuery({
    queryKey: ['myVideosClips'],
    queryFn: () => videosAPI.mine({ type: 'CLIP' }),
    enabled: isArtist,
  });

  const { data: tracksRes, isLoading: loadingTracks } = useQuery({
    queryKey: ['myTracks'],
    queryFn: () => tracksAPI.mine(),
    enabled: isArtist,
  });

  const { data: albumsRes, isLoading: loadingAlbums } = useQuery({
    queryKey: ['myAlbums'],
    queryFn: () => albumsAPI.mine(),
    enabled: isArtist,
  });

  const reels = reelsRes?.data?.data || [];
  const clips = clipsRes?.data?.data || [];
  const tracks = tracksRes?.data?.data || [];
  const albums = albumsRes?.data?.data || [];

  const currentItems =
    activeTab === 'REEL'
      ? reels
      : activeTab === 'TRACK'
      ? tracks
      : activeTab === 'ALBUM'
      ? albums
      : clips;

  const currentLoading =
    activeTab === 'REEL'
      ? loadingReels
      : activeTab === 'TRACK'
      ? loadingTracks
      : activeTab === 'ALBUM'
      ? loadingAlbums
      : loadingClips;

  // Selected item object
  const selectedItem = currentItems.find((i: any) => i.id === selectedItemId);

  // Compute token cost
  let tokensCost = 200;
  let guaranteedViews = 5000;
  if (selectedPackage === 'CUSTOM') {
    const viewsNum = parseInt(customViews, 10) || 500;
    guaranteedViews = viewsNum;
    tokensCost = Math.max(20, Math.ceil(viewsNum / 25));
  } else {
    const pkg = BOOST_PACKAGES.find((p) => p.id === selectedPackage);
    if (pkg) {
      tokensCost = pkg.tokensCost;
      guaranteedViews = pkg.impressions;
    }
  }

  const userBalance = user?.tokenBalance || 0;
  const hasEnoughTokens = userBalance >= tokensCost;

  // Mutation
  const boostMutation = useMutation({
    mutationFn: (data: any) => adsAPI.createBoost(data),
    onSuccess: async (res) => {
      await hapticFeedback.heavy();
      queryClient.invalidateQueries({ queryKey: ['myCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      Alert.alert(
        'Boost Activé avec Succès',
        `Votre contenu est désormais propulsé sur Kephale. Objectif : ${guaranteedViews.toLocaleString()} vues/écoutes.`,
        [
          {
            text: 'Voir mon tableau de bord',
            onPress: () => router.replace('/sponsor' as any),
          },
        ]
      );
    },
    onError: (err: any) => {
      hapticFeedback.error();
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        'Impossible de lancer le boost';
      Alert.alert('Erreur', msg);
    },
  });

  const handleLaunchBoost = async () => {
    if (!selectedItemId) {
      Alert.alert('Contenu requis', 'Veuillez sélectionner le contenu à sponsoriser.');
      return;
    }

    if (!hasEnoughTokens) {
      Alert.alert(
        'Solde insuffisant',
        `Il vous manque ${tokensCost - userBalance} Jetons. Voulez-vous recharger votre solde ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Recharger', onPress: () => router.push('/buy-tokens') },
        ]
      );
      return;
    }

    await hapticFeedback.medium();

    boostMutation.mutate({
      placement: activeTab === 'REEL' ? 'REEL' : activeTab === 'TRACK' ? 'TRACK_BOOST' : activeTab === 'ALBUM' ? 'ALBUM_BOOST' : 'CLIP_PREROLL',
      itemId: selectedItemId,
      itemType: activeTab,
      packageId: selectedPackage,
      customImpressions: selectedPackage === 'CUSTOM' ? parseInt(customViews, 10) || 2500 : undefined,
      targetCountries: selectedCountry === 'ALL' ? [] : [selectedCountry],
      ctaText,
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booster un Contenu</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* WALLET BAR */}
        <View style={styles.balanceBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color="#FFD700" />
            <Text style={styles.balanceBarText}>Mon Solde : {userBalance} Jetons</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/buy-tokens')}>
            <Text style={styles.rechargeLink}>+ Recharger</Text>
          </TouchableOpacity>
        </View>

        {/* STEP 1: CHOOSE TYPE */}
        <Text style={styles.stepTitle}>1. Que souhaitez-vous propulser ?</Text>
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'REEL' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('REEL');
              setSelectedItemId('');
            }}
          >
            <Ionicons
              name="play-circle-outline"
              size={16}
              color={activeTab === 'REEL' ? '#0D0D0D' : '#AAA'}
            />
            <Text style={[styles.tabBtnText, activeTab === 'REEL' && styles.tabBtnTextActive]}>
              Reels
            </Text>
          </TouchableOpacity>

          {isArtist && (
            <>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'TRACK' && styles.tabBtnActive]}
                onPress={() => {
                  setActiveTab('TRACK');
                  setSelectedItemId('');
                }}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={16}
                  color={activeTab === 'TRACK' ? '#0D0D0D' : '#AAA'}
                />
                <Text style={[styles.tabBtnText, activeTab === 'TRACK' && styles.tabBtnTextActive]}>
                  Morceaux
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'ALBUM' && styles.tabBtnActive]}
                onPress={() => {
                  setActiveTab('ALBUM');
                  setSelectedItemId('');
                }}
              >
                <Ionicons
                  name="disc-outline"
                  size={16}
                  color={activeTab === 'ALBUM' ? '#0D0D0D' : '#AAA'}
                />
                <Text style={[styles.tabBtnText, activeTab === 'ALBUM' && styles.tabBtnTextActive]}>
                  Albums
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'CLIP' && styles.tabBtnActive]}
                onPress={() => {
                  setActiveTab('CLIP');
                  setSelectedItemId('');
                }}
              >
                <Ionicons
                  name="videocam-outline"
                  size={16}
                  color={activeTab === 'CLIP' ? '#0D0D0D' : '#AAA'}
                />
                <Text style={[styles.tabBtnText, activeTab === 'CLIP' && styles.tabBtnTextActive]}>
                  Clips
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* STEP 2: SELECT SPECIFIC ITEM */}
        <Text style={styles.stepTitle}>2. Sélectionnez l’élément à propulser</Text>
        {currentLoading ? (
          <ActivityIndicator size="small" color="#E0A96D" style={{ marginVertical: 20 }} />
        ) : currentItems.length === 0 ? (
          <View style={styles.noItemBox}>
            <Text style={styles.noItemText}>
              Aucun élément trouvé dans cette catégorie. Veuillez d’abord publier un{' '}
              {activeTab === 'REEL' ? 'Reel' : activeTab === 'TRACK' ? 'Morceau' : 'contenu'}.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemsScroll}>
            {currentItems.map((item: any) => {
              const isSelected = item.id === selectedItemId;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                  onPress={() => {
                    hapticFeedback.light();
                    setSelectedItemId(item.id);
                  }}
                  activeOpacity={0.8}
                >
                  <VideoThumbnail
                    sourceUrl={item.thumbnailUrl || item.coverUrl}
                    videoUrl={item.videoUrl}
                    style={styles.itemCardThumb}
                    resizeMode="cover"
                  />
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark-circle" size={20} color="#E0A96D" />
                    </View>
                  )}
                  <Text style={styles.itemCardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              );
            })}

          </ScrollView>
        )}

        {/* STEP 3: CHOOSE BOOST PACKAGE */}
        <Text style={styles.stepTitle}>3. Choisissez la puissance du Boost</Text>
        <View style={styles.packagesContainer}>
          {BOOST_PACKAGES.map((pkg) => {
            const isSelected = pkg.id === selectedPackage;
            return (
              <TouchableOpacity
                key={pkg.id}
                style={[styles.pkgCard, isSelected && styles.pkgCardSelected]}
                onPress={() => {
                  hapticFeedback.light();
                  setSelectedPackage(pkg.id);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.pkgHeader}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name={pkg.badgeIcon} size={14} color={pkg.badgeColor} />
                      <Text style={[styles.pkgBadge, { color: pkg.badgeColor }]}>{pkg.badge}</Text>
                    </View>
                    <Text style={styles.pkgTitle}>{pkg.title}</Text>
                  </View>
                  <View style={styles.pkgPriceBox}>
                    <Text style={styles.pkgPriceTokens}>
                      {pkg.id === 'CUSTOM' ? `${tokensCost} Jetons` : `${pkg.tokensCost} Jetons`}
                    </Text>
                    <Text style={styles.pkgDuration}>{pkg.durationDays} jours</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 }}>
                  <Ionicons name="flash" size={14} color="#FFD700" />
                  <Text style={styles.pkgViews}>
                    {pkg.id === 'CUSTOM'
                      ? `${guaranteedViews.toLocaleString()} Vues garanties`
                      : `${pkg.impressions.toLocaleString()} Vues garanties`}
                  </Text>
                </View>
                <Text style={styles.pkgDesc}>{pkg.description}</Text>

                {pkg.id === 'CUSTOM' && isSelected && (
                  <View style={styles.customInputRow}>
                    <Text style={styles.customInputLabel}>Vues souhaitées :</Text>
                    <TextInput
                      style={styles.customInput}
                      value={customViews}
                      onChangeText={(t) => setCustomViews(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="Ex: 5000"
                      placeholderTextColor="#666"
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* STEP 4: TARGETING & CALL TO ACTION */}
        <Text style={styles.stepTitle}>4. Ciblage & Bouton d’action</Text>

        <Text style={styles.subLabel}>Zone géographique cible</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {TARGET_COUNTRIES.map((c) => {
            const isSel = c.code === selectedCountry;
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.countryChip, isSel && styles.countryChipActive]}
                onPress={() => {
                  hapticFeedback.light();
                  setSelectedCountry(c.code);
                }}
              >
                <Ionicons
                  name={c.code === 'ALL' ? 'globe-outline' : 'location-outline'}
                  size={13}
                  color={isSel ? '#0D0D0D' : '#888'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.countryChipText, isSel && styles.countryChipTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.subLabel}>Texte du bouton</Text>
        <View style={styles.ctaRow}>
          {['Découvrir', 'Écouter', 'Regarder', 'Suivre'].map((text) => {
            const isSel = ctaText === text;
            return (
              <TouchableOpacity
                key={text}
                style={[styles.ctaChip, isSel && styles.ctaChipActive]}
                onPress={() => {
                  hapticFeedback.light();
                  setCtaText(text);
                }}
              >
                <Text style={[styles.ctaChipText, isSel && styles.ctaChipTextActive]}>{text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SUMMARY & CHECKOUT CARD */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Récapitulatif de la commande</Text>
          {selectedItem && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12, backgroundColor: '#181818', padding: 10, borderRadius: 10 }}>
              <VideoThumbnail
                sourceUrl={selectedItem.thumbnailUrl || selectedItem.coverUrl}
                videoUrl={selectedItem.videoUrl}
                style={{ width: 44, height: 44, borderRadius: 8 }}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {selectedItem.title}
                </Text>
                <Text style={{ color: '#E0A96D', fontSize: 12, marginTop: 2 }}>
                  {activeTab === 'REEL' ? 'Reel Vidéo' : activeTab === 'TRACK' ? 'Morceau' : activeTab === 'ALBUM' ? 'Album' : 'Clip Vidéo'}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Élément :</Text>
            <Text style={styles.summaryVal} numberOfLines={1}>
              {selectedItem ? selectedItem.title : 'Non sélectionné'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Vues garanties :</Text>
            <Text style={styles.summaryVal}>{guaranteedViews.toLocaleString()} impressions</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total à payer :</Text>
            <Text style={styles.summaryValHighlight}>{tokensCost} Jetons</Text>
          </View>

          {/* LAUNCH BUTTON */}
          <TouchableOpacity
            style={[styles.launchBtn, (!selectedItemId || boostMutation.isPending) && { opacity: 0.6 }]}
            onPress={handleLaunchBoost}
            disabled={!selectedItemId || boostMutation.isPending}
            activeOpacity={0.85}
          >
            {boostMutation.isPending ? (
              <ActivityIndicator color="#0D0D0D" />
            ) : (
              <>
                <Ionicons name="rocket" size={20} color="#0D0D0D" />
                <Text style={styles.launchBtnText}>
                  {hasEnoughTokens
                    ? `Confirmer & Débiter ${tokensCost} Jetons`
                    : `Solde insuffisant (Recharger)`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 60 },

  balanceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161616',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  balanceBarText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  rechargeLink: { color: '#E0A96D', fontSize: 13, fontWeight: '700' },

  stepTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginTop: 10, marginBottom: 12 },
  subLabel: { color: '#888', fontSize: 12, marginBottom: 8 },

  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#161616',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
  },
  tabBtnActive: { backgroundColor: '#E0A96D', borderColor: '#E0A96D' },
  tabBtnText: { color: '#AAA', fontSize: 13, fontWeight: '600' },
  tabBtnTextActive: { color: '#0D0D0D', fontWeight: '800' },

  noItemBox: {
    backgroundColor: '#121212',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 20,
  },
  noItemText: { color: '#888', fontSize: 13, lineHeight: 18, textAlign: 'center' },

  itemsScroll: { flexDirection: 'row', marginBottom: 24 },
  itemCard: {
    width: 110,
    marginRight: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  itemCardSelected: { borderColor: '#E0A96D', backgroundColor: '#1A1815' },
  itemCardThumb: { width: 94, height: 94, borderRadius: 8, backgroundColor: '#222', marginBottom: 6 },
  checkBadge: { position: 'absolute', top: 12, right: 12 },
  itemCardTitle: { color: '#FFF', fontSize: 12, fontWeight: '600', width: '100%', textAlign: 'center' },

  packagesContainer: { gap: 12, marginBottom: 24 },
  pkgCard: {
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#242424',
  },
  pkgCardSelected: { borderColor: '#E0A96D', backgroundColor: '#1C1914' },
  pkgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pkgBadge: { color: '#E0A96D', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  pkgTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  pkgPriceBox: { alignItems: 'flex-end' },
  pkgPriceTokens: { color: '#E0A96D', fontSize: 16, fontWeight: '800' },
  pkgDuration: { color: '#666', fontSize: 11 },
  pkgViews: { color: '#FFF', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  pkgDesc: { color: '#888', fontSize: 12 },

  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  customInputLabel: { color: '#AAA', fontSize: 13 },
  customInput: {
    backgroundColor: '#0D0D0D',
    color: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    width: 120,
    textAlign: 'center',
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#333',
  },

  countryChip: {
    backgroundColor: '#161616',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#262626',
  },
  countryChipActive: { backgroundColor: '#E0A96D', borderColor: '#E0A96D' },
  countryChipText: { color: '#AAA', fontSize: 12, fontWeight: '600' },
  countryChipTextActive: { color: '#0D0D0D', fontWeight: '800' },

  ctaRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  ctaChip: {
    flex: 1,
    backgroundColor: '#161616',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262626',
  },
  ctaChipActive: { backgroundColor: '#E0A96D', borderColor: '#E0A96D' },
  ctaChipText: { color: '#AAA', fontSize: 13, fontWeight: '600' },
  ctaChipTextActive: { color: '#0D0D0D', fontWeight: '800' },

  summaryCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262626',
    marginTop: 10,
  },
  summaryTitle: { color: '#FFF', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: '#888', fontSize: 13 },
  summaryVal: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: '60%' },
  summaryValHighlight: { color: '#E0A96D', fontSize: 15, fontWeight: '800' },

  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E0A96D',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  launchBtnText: { color: '#0D0D0D', fontSize: 14, fontWeight: '800' },
});

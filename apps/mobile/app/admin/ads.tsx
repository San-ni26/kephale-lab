import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAdsAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import { hapticFeedback } from '../../src/lib/haptics';
import type { AdPlacement, AdStatus } from '@kephale/types';

const { width: SCREEN_W } = Dimensions.get('window');

type TabType = 'CAMPAIGNS' | 'ADVERTISERS' | 'NEW_CAMPAIGN' | 'NEW_ADVERTISER';

export default function AdminAdsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('CAMPAIGNS');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Form states for New Campaign
  const [cTitle, setCTitle] = useState('');
  const [cAdvertiserId, setCAdvertiserId] = useState('');
  const [cPlacement, setCPlacement] = useState<AdPlacement>('REEL');
  const [cMediaUrl, setCMediaUrl] = useState('');
  const [cThumbnailUrl, setCThumbnailUrl] = useState('');
  const [cTargetUrl, setCTargetUrl] = useState('');
  const [cCtaText, setCCtaText] = useState('En savoir plus');
  const [cCountries, setCCountries] = useState('');
  const [cMaxImpressions, setCMaxImpressions] = useState('');
  const [cDaysDuration, setCDaysDuration] = useState('30');

  // Form states for New Advertiser
  const [advName, setAdvName] = useState('');
  const [advCompany, setAdvCompany] = useState('');
  const [advEmail, setAdvEmail] = useState('');
  const [advPhone, setAdvPhone] = useState('');
  const [advNotes, setAdvNotes] = useState('');

  if (user?.role !== 'ADMIN') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: '#FFF', padding: 20 }}>Accès réservé aux administrateurs.</Text>
      </SafeAreaView>
    );
  }

  // Queries
  const { data: statsRes, isLoading: loadingStats } = useQuery({
    queryKey: ['adminAdsStats'],
    queryFn: () => adminAdsAPI.getStats(),
  });

  const { data: campaignsRes, isLoading: loadingCampaigns } = useQuery({
    queryKey: ['adminAdsCampaigns', statusFilter],
    queryFn: () => adminAdsAPI.getCampaigns(statusFilter !== 'ALL' ? { status: statusFilter } : undefined),
  });

  const { data: advertisersRes, isLoading: loadingAdvertisers } = useQuery({
    queryKey: ['adminAdsAdvertisers'],
    queryFn: () => adminAdsAPI.getAdvertisers(),
  });

  // Mutations
  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) => adminAdsAPI.toggleCampaignStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminAdsCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['adminAdsStats'] });
      hapticFeedback.medium();
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Impossible de changer le statut');
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string) => adminAdsAPI.deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminAdsCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['adminAdsStats'] });
      hapticFeedback.medium();
      Alert.alert('Succès', 'Campagne supprimée');
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: (data: any) => adminAdsAPI.createCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminAdsCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['adminAdsStats'] });
      hapticFeedback.success();
      Alert.alert('Succès', 'Campagne créée et mise en ligne !');
      // Reset form & go back to list
      setCTitle('');
      setCMediaUrl('');
      setCTargetUrl('');
      setActiveTab('CAMPAIGNS');
    },
    onError: (err: any) => {
      Alert.alert('Erreur de création', err?.response?.data?.error?.message || 'Données invalides');
    },
  });

  const createAdvertiserMutation = useMutation({
    mutationFn: (data: any) => adminAdsAPI.createAdvertiser(data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['adminAdsAdvertisers'] });
      queryClient.invalidateQueries({ queryKey: ['adminAdsStats'] });
      hapticFeedback.success();
      Alert.alert('Succès', 'Annonceur ajouté');
      if (res.data?.data?.id) {
        setCAdvertiserId(res.data.data.id);
      }
      setAdvName('');
      setAdvCompany('');
      setAdvEmail('');
      setAdvPhone('');
      setAdvNotes('');
      setActiveTab('ADVERTISERS');
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err?.response?.data?.error?.message || 'Données annonceur invalides');
    },
  });

  const stats = statsRes?.data?.data;
  const campaigns = campaignsRes?.data?.data || [];
  const advertisers = advertisersRes?.data?.data || [];

  const handleCreateCampaignSubmit = () => {
    if (!cTitle.trim() || !cAdvertiserId || !cMediaUrl.trim() || !cTargetUrl.trim()) {
      Alert.alert('Champs requis', 'Veuillez renseigner le titre, choisir un annonceur, et fournir les URLs.');
      return;
    }

    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + parseInt(cDaysDuration || '30', 10) * 86400000).toISOString();
    const targetCountries = cCountries
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    createCampaignMutation.mutate({
      advertiserId: cAdvertiserId,
      title: cTitle.trim(),
      placement: cPlacement,
      mediaUrl: cMediaUrl.trim(),
      thumbnailUrl: cThumbnailUrl.trim() || undefined,
      targetUrl: cTargetUrl.trim(),
      ctaText: cCtaText.trim() || 'En savoir plus',
      targetCountries,
      startDate,
      endDate,
      maxImpressions: cMaxImpressions ? parseInt(cMaxImpressions, 10) : undefined,
      status: 'ACTIVE',
    });
  };

  const handleCreateAdvertiserSubmit = () => {
    if (!advName.trim()) {
      Alert.alert('Champs requis', 'Le nom du contact ou de l’annonceur est obligatoire.');
      return;
    }
    createAdvertiserMutation.mutate({
      name: advName.trim(),
      company: advCompany.trim() || undefined,
      contactEmail: advEmail.trim() || undefined,
      contactPhone: advPhone.trim() || undefined,
      notes: advNotes.trim() || undefined,
    });
  };

  const getStatusColor = (st: AdStatus) => {
    switch (st) {
      case 'ACTIVE':
        return '#34C759';
      case 'PAUSED':
        return '#FF9500';
      case 'COMPLETED':
        return '#AF52DE';
      default:
        return '#8E8E93';
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Régie Publicitaire</Text>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={() => {
            queryClient.invalidateQueries({ queryKey: ['adminAdsStats'] });
            queryClient.invalidateQueries({ queryKey: ['adminAdsCampaigns'] });
          }}
        >
          <Ionicons name="refresh" size={20} color="#E0A96D" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* KPI OVERVIEW */}
        {stats && (
          <View style={styles.kpiContainer}>
            <View style={styles.kpiCard}>
              <Ionicons name="eye-outline" size={20} color="#007AFF" />
              <Text style={styles.kpiValue}>{(stats.totalImpressions || 0).toLocaleString()}</Text>
              <Text style={styles.kpiLabel}>Impressions</Text>
            </View>

            <View style={styles.kpiCard}>
              <Ionicons name="finger-print-outline" size={20} color="#34C759" />
              <Text style={styles.kpiValue}>{(stats.totalClicks || 0).toLocaleString()}</Text>
              <Text style={styles.kpiLabel}>Clics</Text>
            </View>

            <View style={styles.kpiCard}>
              <Ionicons name="trending-up" size={20} color="#FF9500" />
              <Text style={styles.kpiValue}>{stats.averageCtr || 0}%</Text>
              <Text style={styles.kpiLabel}>CTR Moyen</Text>
            </View>

            <View style={styles.kpiCard}>
              <Ionicons name="play-circle-outline" size={20} color="#AF52DE" />
              <Text style={styles.kpiValue}>{stats.activeCampaigns || 0}</Text>
              <Text style={styles.kpiLabel}>Actives</Text>
            </View>
          </View>
        )}

        {/* TABS NAVIGATION */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'CAMPAIGNS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('CAMPAIGNS')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'CAMPAIGNS' && styles.tabBtnTextActive]}>
              Campagnes ({campaigns.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'ADVERTISERS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('ADVERTISERS')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'ADVERTISERS' && styles.tabBtnTextActive]}>
              Annonceurs ({advertisers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'NEW_CAMPAIGN' && styles.tabBtnActive]}
            onPress={() => setActiveTab('NEW_CAMPAIGN')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'NEW_CAMPAIGN' && styles.tabBtnTextActive]}>
              + Campagne
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'NEW_ADVERTISER' && styles.tabBtnActive]}
            onPress={() => setActiveTab('NEW_ADVERTISER')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'NEW_ADVERTISER' && styles.tabBtnTextActive]}>
              + Annonceur
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1 : CAMPAIGNS LIST ─── */}
        {activeTab === 'CAMPAIGNS' && (
          <View>
            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED'].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.chip, statusFilter === st && styles.chipActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.chipText, statusFilter === st && styles.chipTextActive]}>
                    {st === 'ALL' ? 'Toutes' : st}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loadingCampaigns ? (
              <ActivityIndicator size="large" color="#E0A96D" style={{ marginTop: 40 }} />
            ) : campaigns.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="megaphone-outline" size={48} color="#444" />
                <Text style={styles.emptyText}>Aucune campagne trouvée.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveTab('NEW_CAMPAIGN')}>
                  <Text style={styles.emptyBtnText}>Créer une première campagne</Text>
                </TouchableOpacity>
              </View>
            ) : (
              campaigns.map((c: any) => {
                const ctr = c.currentImpressions > 0 ? ((c.currentClicks / c.currentImpressions) * 100).toFixed(1) : '0.0';
                return (
                  <View key={c.id} style={styles.campaignCard}>
                    {/* Top line */}
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{c.title}</Text>
                        <Text style={styles.cardAdvertiser}>
                          {c.advertiser?.company || c.advertiser?.name || (c.user ? `Créateur: ${c.user.name}` : 'Annonceur direct')}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { borderColor: getStatusColor(c.status) }]}>
                        <Text style={[styles.statusBadgeText, { color: getStatusColor(c.status) }]}>
                          {c.status}
                        </Text>
                      </View>
                    </View>

                    {/* Placement & Targeting */}
                    <View style={styles.tagRow}>
                      <View style={styles.placementTag}>
                        <Text style={styles.placementTagText}>{c.placement}</Text>
                      </View>
                      {c.targetCountries?.length > 0 ? (
                        <View style={styles.countryTag}>
                          <Ionicons name="globe-outline" size={12} color="#007AFF" style={{ marginRight: 4 }} />
                          <Text style={styles.countryTagText}>{c.targetCountries.join(', ')}</Text>
                        </View>
                      ) : (
                        <View style={styles.countryTag}>
                          <Ionicons name="globe-outline" size={12} color="#007AFF" style={{ marginRight: 4 }} />
                          <Text style={styles.countryTagText}>Mondial</Text>
                        </View>
                      )}
                    </View>

                    {/* Metrics Progress */}
                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Impressions</Text>
                        <Text style={styles.metricValue}>
                          {c.currentImpressions} {c.maxImpressions ? `/ ${c.maxImpressions}` : ''}
                        </Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>Clics</Text>
                        <Text style={styles.metricValue}>{c.currentClicks}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>CTR</Text>
                        <Text style={styles.metricValue}>{ctr}%</Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.reportBtn}
                        onPress={() => router.push(`/admin/campaign/${c.id}` as any)}
                      >
                        <Ionicons name="stats-chart" size={15} color="#E0A96D" />
                        <Text style={styles.reportBtnText}>Rapport Client</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: c.status === 'ACTIVE' ? '#FF950022' : '#34C75922' }]}
                        onPress={() => toggleStatusMutation.mutate(c.id)}
                      >
                        <Ionicons
                          name={c.status === 'ACTIVE' ? 'pause' : 'play'}
                          size={16}
                          color={c.status === 'ACTIVE' ? '#FF9500' : '#34C759'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: '#FF3B3022' }]}
                        onPress={() => {
                          Alert.alert('Supprimer la campagne', 'Êtes-vous sûr de vouloir supprimer cette campagne ?', [
                            { text: 'Annuler', style: 'cancel' },
                            { text: 'Supprimer', style: 'destructive', onPress: () => deleteCampaignMutation.mutate(c.id) },
                          ]);
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ─── TAB 2 : ADVERTISERS LIST ─── */}
        {activeTab === 'ADVERTISERS' && (
          <View>
            {loadingAdvertisers ? (
              <ActivityIndicator size="large" color="#E0A96D" style={{ marginTop: 40 }} />
            ) : advertisers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={48} color="#444" />
                <Text style={styles.emptyText}>Aucun annonceur enregistré.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveTab('NEW_ADVERTISER')}>
                  <Text style={styles.emptyBtnText}>Créer un profil Annonceur</Text>
                </TouchableOpacity>
              </View>
            ) : (
              advertisers.map((adv: any) => (
                <View key={adv.id} style={styles.advertiserCard}>
                  <View style={styles.advertiserHeader}>
                    <View>
                      <Text style={styles.advName}>{adv.name}</Text>
                      {adv.company && <Text style={styles.advCompany}>{adv.company}</Text>}
                    </View>
                    <View style={styles.advCampaignCount}>
                      <Text style={styles.advCountText}>{adv._count?.campaigns || 0} Campagnes</Text>
                    </View>
                  </View>

                  <View style={styles.advContactRow}>
                    {adv.contactEmail && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="mail-outline" size={13} color="#888" />
                        <Text style={styles.advContactText}>{adv.contactEmail}</Text>
                      </View>
                    )}
                    {adv.contactPhone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call-outline" size={13} color="#888" />
                        <Text style={styles.advContactText}>{adv.contactPhone}</Text>
                      </View>
                    )}
                  </View>

                  {adv.notes && <Text style={styles.advNotes}>Note: {adv.notes}</Text>}
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── TAB 3 : NEW CAMPAIGN FORM ─── */}
        {activeTab === 'NEW_CAMPAIGN' && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Créer une Nouvelle Campagne</Text>

            {/* Advertiser Selector */}
            <Text style={styles.inputLabel}>Sélectionner l'Annonceur *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.advPickerScroll}>
              {advertisers.map((adv: any) => (
                <TouchableOpacity
                  key={adv.id}
                  style={[styles.advPickItem, cAdvertiserId === adv.id && styles.advPickItemActive]}
                  onPress={() => setCAdvertiserId(adv.id)}
                >
                  <Text style={[styles.advPickText, cAdvertiserId === adv.id && styles.advPickTextActive]}>
                    {adv.company || adv.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {advertisers.length === 0 && (
              <TouchableOpacity onPress={() => setActiveTab('NEW_ADVERTISER')}>
                <Text style={styles.helperLink}>+ Créer d'abord un annonceur</Text>
              </TouchableOpacity>
            )}

            {/* Campaign Title */}
            <Text style={styles.inputLabel}>Titre de la Campagne *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Lancement Nouvelle Boisson 2026"
              placeholderTextColor="#666"
              value={cTitle}
              onChangeText={setCTitle}
            />

            {/* Placement */}
            <Text style={styles.inputLabel}>Emplacement *</Text>
            <View style={styles.placementRow}>
              {(['REEL', 'CLIP_PREROLL', 'BANNER'] as AdPlacement[]).map((pl) => (
                <TouchableOpacity
                  key={pl}
                  style={[styles.placementBtn, cPlacement === pl && styles.placementBtnActive]}
                  onPress={() => setCPlacement(pl)}
                >
                  <Text style={[styles.placementBtnText, cPlacement === pl && styles.placementBtnTextActive]}>
                    {pl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Media URL */}
            <Text style={styles.inputLabel}>URL Média Vidéo/Image (S3 ou CDN) *</Text>
            <TextInput
              style={styles.input}
              placeholder="https://s3.kephale.app/ads/banner-hd.jpg"
              placeholderTextColor="#666"
              value={cMediaUrl}
              onChangeText={setCMediaUrl}
              autoCapitalize="none"
            />

            {/* Target URL */}
            <Text style={styles.inputLabel}>URL de Redirection (Lien Clic) *</Text>
            <TextInput
              style={styles.input}
              placeholder="https://sponsor.com/promo-kephale"
              placeholderTextColor="#666"
              value={cTargetUrl}
              onChangeText={setCTargetUrl}
              autoCapitalize="none"
            />

            {/* CTA Text */}
            <Text style={styles.inputLabel}>Texte du Bouton CTA</Text>
            <TextInput
              style={styles.input}
              placeholder="En savoir plus / Acheter / Découvrir"
              placeholderTextColor="#666"
              value={cCtaText}
              onChangeText={setCCtaText}
            />

            {/* Target Countries */}
            <Text style={styles.inputLabel}>Ciblage Pays (Codes ISO séparés par virgule, vide = Mondial)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: CI, SN, ML, CM, FR"
              placeholderTextColor="#666"
              value={cCountries}
              onChangeText={setCCountries}
              autoCapitalize="characters"
            />

            {/* Duration & Cap */}
            <View style={styles.dualInputRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Durée (Jours)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="30"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={cDaysDuration}
                  onChangeText={setCDaysDuration}
                />
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>Plafond Vues (Optionnel)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 50000"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={cMaxImpressions}
                  onChangeText={setCMaxImpressions}
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateCampaignSubmit}
              disabled={createCampaignMutation.isPending}
            >
              {createCampaignMutation.isPending ? (
                <ActivityIndicator color="#0D0D0D" />
              ) : (
                <Text style={styles.submitBtnText}>Publier la Campagne</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ─── TAB 4 : NEW ADVERTISER FORM ─── */}
        {activeTab === 'NEW_ADVERTISER' && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Ajouter un Annonceur Partenaire</Text>

            <Text style={styles.inputLabel}>Nom du Contact / Responsable *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Jean Dupont"
              placeholderTextColor="#666"
              value={advName}
              onChangeText={setAdvName}
            />

            <Text style={styles.inputLabel}>Nom de l'Entreprise / Marque</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Orange Mali, Solibra, Moov..."
              placeholderTextColor="#666"
              value={advCompany}
              onChangeText={setAdvCompany}
            />

            <Text style={styles.inputLabel}>Email Professionnel</Text>
            <TextInput
              style={styles.input}
              placeholder="marketing@entreprise.com"
              placeholderTextColor="#666"
              value={advEmail}
              onChangeText={setAdvEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Numéro de Téléphone</Text>
            <TextInput
              style={styles.input}
              placeholder="+225 07 00 00 00 00"
              placeholderTextColor="#666"
              value={advPhone}
              onChangeText={setAdvPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>Notes internes (Budget convenu, contact...)</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="Ex: Accord sponsoring 1M FCFA pour 3 mois."
              placeholderTextColor="#666"
              value={advNotes}
              onChangeText={setAdvNotes}
              multiline
            />

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateAdvertiserSubmit}
              disabled={createAdvertiserMutation.isPending}
            >
              {createAdvertiserMutation.isPending ? (
                <ActivityIndicator color="#0D0D0D" />
              ) : (
                <Text style={styles.submitBtnText}>Enregistrer l'Annonceur</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
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
    borderBottomColor: '#1F1F1F',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  headerActionBtn: { padding: 6, backgroundColor: '#1A1A1A', borderRadius: 8 },
  content: { padding: 16, paddingBottom: 60 },

  // KPI Overview
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  kpiCard: {
    width: (SCREEN_W - 48) / 4,
    backgroundColor: '#141414',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    alignItems: 'center',
  },
  kpiValue: { color: '#FFF', fontSize: 15, fontWeight: '800', marginTop: 4 },
  kpiLabel: { color: '#888', fontSize: 10, marginTop: 2, textAlign: 'center' },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#E0A96D',
  },
  tabBtnText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#0D0D0D',
    fontWeight: '800',
  },

  // Filter Chips
  chipsScroll: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#161616',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#262626',
  },
  chipActive: {
    borderColor: '#E0A96D',
    backgroundColor: 'rgba(224, 169, 109, 0.15)',
  },
  chipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#E0A96D' },

  // Campaign Card
  campaignCard: {
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  cardAdvertiser: { color: '#E0A96D', fontSize: 12, fontWeight: '600' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },

  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  placementTag: {
    backgroundColor: '#202020',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  placementTagText: { color: '#CCC', fontSize: 11, fontWeight: '600' },
  countryTag: {
    backgroundColor: '#202020',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countryTagText: { color: '#888', fontSize: 11 },

  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  metricItem: { alignItems: 'center' },
  metricLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  metricValue: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(224, 169, 109, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(224, 169, 109, 0.3)',
    marginRight: 'auto',
  },
  reportBtnText: { color: '#E0A96D', fontSize: 12, fontWeight: '700' },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },

  // Advertiser Card
  advertiserCard: {
    backgroundColor: '#121212',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  advertiserHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  advName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  advCompany: { color: '#E0A96D', fontSize: 13, fontWeight: '600' },
  advCampaignCount: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  advCountText: { color: '#888', fontSize: 11, fontWeight: '600' },
  advContactRow: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  advContactText: { color: '#AAA', fontSize: 12 },
  advNotes: { color: '#666', fontSize: 11, fontStyle: 'italic', marginTop: 4 },

  // Forms
  formContainer: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
  },
  formTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 18 },
  inputLabel: { color: '#AAA', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  advPickerScroll: { marginBottom: 4 },
  advPickItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  advPickItemActive: {
    backgroundColor: '#E0A96D',
    borderColor: '#E0A96D',
  },
  advPickText: { color: '#888', fontSize: 12, fontWeight: '600' },
  advPickTextActive: { color: '#0D0D0D', fontWeight: '800' },
  helperLink: { color: '#E0A96D', fontSize: 12, marginTop: 6, fontWeight: '600' },

  placementRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  placementBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  placementBtnActive: {
    borderColor: '#E0A96D',
    backgroundColor: 'rgba(224, 169, 109, 0.15)',
  },
  placementBtnText: { color: '#888', fontSize: 12, fontWeight: '600' },
  placementBtnTextActive: { color: '#E0A96D', fontWeight: '800' },

  dualInputRow: { flexDirection: 'row', justifyContent: 'space-between' },

  submitBtn: {
    backgroundColor: '#E0A96D',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: { color: '#0D0D0D', fontSize: 15, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyText: { color: '#888', fontSize: 14, marginVertical: 12 },
  emptyBtn: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyBtnText: { color: '#E0A96D', fontSize: 13, fontWeight: '600' },
});

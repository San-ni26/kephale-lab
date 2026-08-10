import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, usePlayerStore } from '../../src/stores';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../../src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { clearEntireAppCache } from '../../src/lib/cacheManager';

export default function ProfileScreen() {
  const { isAuthenticated, user, logout, refreshToken } = useAuthStore();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (isAuthenticated && !user) {
      useAuthStore.getState().checkAuth().catch(() => {});
    }
  }, [isAuthenticated, user]);

  const handleLogout = async () => {
    // 1. Déconnexion API en arrière-plan (non bloquante)
    if (refreshToken) {
      authAPI.logout(refreshToken).catch(() => {});
    }

    // 2. Déconnexion locale instantanée
    logout();
    if (queryClient) {
      queryClient.clear();
    }
    usePlayerStore.getState().clearPlayer();

    // 3. Redirection immédiate vers l'accueil
    router.replace('/');

    // 4. Nettoyage mémoire / cache en arrière-plan sans bloquer l'UI
    setTimeout(() => {
      clearEntireAppCache({ clearAuth: false, queryClient }).catch(() => {});
    }, 100);
  };

  const confirmLogout = () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: handleLogout },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <Image source={require('../../assets/profile_bg.png')} style={styles.backgroundImage} />
        <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.7)', '#000000']} style={styles.backgroundOverlay} />
        <View style={styles.unauthContainer}>
          <Ionicons name="person-circle-outline" size={80} color="#FF5A00" />
          <Text style={styles.unauthTitle}>Votre Profil</Text>
          <Text style={styles.unauthText}>
            Connectez-vous pour gérer votre compte, vos abonnements, et découvrir des contenus exclusifs.
          </Text>
          <TouchableOpacity
            style={styles.unauthButton}
            onPress={() => router.push('/(auth)/welcome')}
          >
            <Text style={styles.unauthButtonText}>Se connecter / S'inscrire</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <Image source={require('../../assets/profile_bg.png')} style={styles.backgroundImage} />
        <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', '#000000']} style={styles.backgroundOverlay} />
        <View style={[styles.unauthContainer, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#FF5A00" />
          <Text style={[styles.unauthText, { marginTop: 16 }]}>Chargement de votre profil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isArtist = !!user.artistProfile || user.role === 'ARTIST';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Image source={require('../../assets/profile_bg.png')} style={styles.backgroundImage} />
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)', '#000000']} style={styles.backgroundOverlay} />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {user.avatar ? (
              <Image 
                source={{ uri: user.avatar }} 
                style={styles.avatar} 
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitials}>{user.name?.charAt(0).toUpperCase() || 'U'}</Text>
              </View>
            )}
            {user.artistProfile && (
              <View style={styles.artistBadge}>
                <Ionicons name="star" size={12} color="#000" />
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user.name}</Text>
          {user.username && (
            <Text style={styles.userUsername}>
              {user.username.startsWith('@') ? user.username : `@${user.username}`}
            </Text>
          )}
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Abonnement</Text>
            <Text style={styles.statValue}>{user.subscription?.tier || 'FREE'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Jetons Kephale</Text>
            <Text style={styles.statValue}>{user.tokenBalance || 0}</Text>
          </View>
        </View>

        {/* Styled Side-by-Side Action Cards (Côte à côte) */}
        <View style={styles.actionCardsRow}>
          {isArtist ? (
            <>
              {/* Card 1: Studio Artiste */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.85}
                onPress={() => router.push('/artist-dashboard' as any)}
              >
                <LinearGradient
                  colors={['#381806', '#1E0B02']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionCardGradient, { borderColor: 'rgba(255, 90, 0, 0.45)' }]}
                >
                  <View style={styles.actionCardTop}>
                    <View style={[styles.actionCardIconBox, { backgroundColor: 'rgba(255, 90, 0, 0.22)' }]}>
                      <Ionicons name="mic" size={20} color="#FF5A00" />
                    </View>
                    <View style={styles.proBadge}>
                      <Text style={styles.proBadgeText}>PRO</Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardTitle}>Mon Studio</Text>
                  <Text style={styles.actionCardSub}>Gérer sorties & stats</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 2: Ma Page Publique */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.85}
                onPress={() => {
                  if (user.artistProfile) router.push(`/artist/${user.artistProfile.id}` as any);
                  else router.push('/profile/my-reels' as any);
                }}
              >
                <LinearGradient
                  colors={['#22123A', '#130924']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionCardGradient, { borderColor: 'rgba(168, 85, 247, 0.35)' }]}
                >
                  <View style={styles.actionCardTop}>
                    <View style={[styles.actionCardIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                      <Ionicons name="person-circle-outline" size={22} color="#A855F7" />
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#A855F7" />
                  </View>
                  <Text style={styles.actionCardTitle}>Page Publique</Text>
                  <Text style={styles.actionCardSub}>Voir mon profil</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Card 1: Mes Reels */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.85}
                onPress={() => router.push('/profile/my-reels' as any)}
              >
                <LinearGradient
                  colors={['#22123A', '#130924']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionCardGradient, { borderColor: 'rgba(168, 85, 247, 0.35)' }]}
                >
                  <View style={styles.actionCardTop}>
                    <View style={[styles.actionCardIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                      <Ionicons name="play-circle" size={22} color="#A855F7" />
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#A855F7" />
                  </View>
                  <Text style={styles.actionCardTitle}>Mes Reels</Text>
                  <Text style={styles.actionCardSub}>Vidéos & créations</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 2: Devenir Artiste (Stylisé comme Créer un Reel) */}
              <TouchableOpacity
                style={styles.actionCard}
                activeOpacity={0.85}
                onPress={() => router.push('/profile/become-artist' as any)}
              >
                <LinearGradient
                  colors={['#381806', '#1E0B02']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionCardGradient, { borderColor: 'rgba(255, 90, 0, 0.45)' }]}
                >
                  <View style={styles.actionCardTop}>
                    <View style={[styles.actionCardIconBox, { backgroundColor: 'rgba(255, 90, 0, 0.22)' }]}>
                      <Ionicons name="mic" size={20} color="#FF5A00" />
                    </View>
                    <View style={styles.proBadge}>
                      <Text style={styles.proBadgeText}>NOUVEAU</Text>
                    </View>
                  </View>
                  <Text style={styles.actionCardTitle}>Devenir Artiste</Text>
                  <Text style={styles.actionCardSub}>Publier ma musique</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Mes Boosts & Sponsoring Banner */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <TouchableOpacity
            style={styles.sponsorBanner}
            activeOpacity={0.85}
            onPress={() => router.push('/sponsor' as any)}
          >
            <LinearGradient
              colors={['#241A10', '#140E08']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sponsorGradient}
            >
              <View style={styles.sponsorIconBox}>
                <Ionicons name="rocket" size={22} color="#E0A96D" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sponsorTitle}>Mes Boosts & Sponsoring</Text>
                <Text style={styles.sponsorSubtitle}>Promouvoir Reels, Morceaux & Clips</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#E0A96D" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Mon Compte</Text>

          {/* Gérer mon abonnement */}
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/premium')}>
            <View style={styles.menuIconBox}>
              <Ionicons name="card-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Gérer mon abonnement</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

          {/* Acheter des jetons */}
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/buy-tokens' as any)}>
            <View style={styles.menuIconBox}>
              <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Acheter des jetons</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

          {/* Historique d'achats */}
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/purchases' as any)}>
            <View style={styles.menuIconBox}>
              <Ionicons name="cart-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Historique d'achats</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

          {/* Panneau d'Administration (si ADMIN) */}
          {user.role === 'ADMIN' && (
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemHighlight]}
              onPress={() => router.push('/admin')}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#007AFF22' }]}>
                <Ionicons name="pie-chart" size={20} color="#007AFF" />
              </View>
              <Text style={[styles.menuItemText, { color: '#007AFF' }]}>Panneau d'Administration</Text>
              <Ionicons name="chevron-forward" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}

          {/* Paramètres (avec Modifier le profil à l'intérieur) */}
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings')}>
            <View style={styles.menuIconBox}>
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Paramètres</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutBtnText}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Kephale App v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backgroundImage: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'cover' },
  backgroundOverlay: { position: 'absolute', width: '100%', height: '100%' },

  unauthContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unauthTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 12,
  },
  unauthText: {
    color: '#A0A0A0',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  unauthButton: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  unauthButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  header: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2.5,
    borderColor: '#333333',
  },
  avatarPlaceholder: {
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: 'bold',
  },
  artistBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FF5A00',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  userName: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', marginBottom: 3 },
  userUsername: { color: '#A0A0A0', fontSize: 15, marginBottom: 3 },
  userEmail: { color: '#777777', fontSize: 13 },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  statLabel: {
    color: '#A0A0A0',
    fontSize: 11,
    marginBottom: 6,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  /* Action cards side by side */
  actionCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionCardGradient: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    minHeight: 112,
    justifyContent: 'space-between',
  },
  actionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionCardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proBadge: {
    backgroundColor: '#FF5A00',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionCardSub: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '500',
  },

  /* Sponsor banner */
  sponsorBanner: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  sponsorGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(224, 169, 109, 0.35)',
  },
  sponsorIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(224, 169, 109, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  sponsorTitle: {
    color: '#E0A96D',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  sponsorSubtitle: {
    color: '#999999',
    fontSize: 12,
  },

  menuSection: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  menuItemHighlight: {
    borderWidth: 1,
    borderColor: '#007AFF33',
    backgroundColor: '#007AFF08',
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuItemText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
    marginBottom: 28,
  },
  logoutBtnText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  versionText: {
    color: '#555555',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 40,
  }
});

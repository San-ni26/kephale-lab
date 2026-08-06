import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../../src/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { clearEntireAppCache } from '../../src/lib/cacheManager';
import ChangePhoneModal from '../../src/components/ChangePhoneModal';

export default function ProfileScreen() {
  const { isAuthenticated, user, logout, refreshToken } = useAuthStore();
  const [showChangePhone, setShowChangePhone] = React.useState(false);
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await authAPI.logout(refreshToken);
      }
    } catch (e) {
      console.log('Erreur deconnexion API', e);
    } finally {
      await clearEntireAppCache({ clearAuth: true, queryClient });
      router.replace('/');
    }
  };

  const confirmLogout = () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: handleLogout },
    ]);
  };

  if (!isAuthenticated || !user) {
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

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Mon Compte</Text>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/premium')}>
            <View style={styles.menuIconBox}>
              <Ionicons name="card-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Gérer mon abonnement</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/buy-tokens' as any)}>
            <View style={styles.menuIconBox}>
              <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Acheter des jetons</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: '#181510', borderColor: 'rgba(224, 169, 109, 0.3)', borderWidth: 1 }]}
            onPress={() => router.push('/sponsor' as any)}
          >
            <View style={[styles.menuIconBox, { backgroundColor: 'rgba(224, 169, 109, 0.2)' }]}>
              <Ionicons name="rocket" size={20} color="#E0A96D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuItemText, { color: '#E0A96D', fontWeight: '700' }]}>
                Mes Boosts & Sponsoring
              </Text>
              <Text style={{ color: '#888', fontSize: 11 }}>
                Promouvoir Reels, Morceaux & Clips
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#E0A96D" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/purchases' as any)}>
            <View style={styles.menuIconBox}>
              <Ionicons name="cart-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Historique d'achats</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

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

          {user.role === 'ARTIST' || user.artistProfile || user.role === 'ADMIN' ? (
            <>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemHighlight]}
                onPress={() => router.push('/artist-dashboard')}
              >
                <View style={[styles.menuIconBox, { backgroundColor: '#FF5A0022' }]}>
                  <Ionicons name="mic" size={20} color="#FF5A00" />
                </View>
                <Text style={[styles.menuItemText, { color: '#FF5A00' }]}>Mon Studio Artiste</Text>
                <Ionicons name="chevron-forward" size={20} color="#FF5A00" />
              </TouchableOpacity>
              {user.artistProfile && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => router.push(`/artist/${user.artistProfile!.id}`)}
                >
                  <View style={styles.menuIconBox}>
                    <Ionicons name="person-outline" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.menuItemText}>Ma Page Publique</Text>
                  <Ionicons name="chevron-forward" size={20} color="#666666" />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemHighlight]}
                onPress={() => router.push('/studio/create-reel' as any)}
              >
                <View style={[styles.menuIconBox, { backgroundColor: '#FF5A0022' }]}>
                  <Ionicons name="videocam-outline" size={20} color="#FF5A00" />
                </View>
                <Text style={[styles.menuItemText, { color: '#FF5A00', fontWeight: '700' }]}>Créer un Reel</Text>
                <Ionicons name="chevron-forward" size={20} color="#FF5A00" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/profile/my-reels' as any)}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="play-circle-outline" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.menuItemText}>Mes Reels</Text>
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/profile/become-artist')}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.menuItemText}>Devenir Artiste</Text>
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={() => setShowChangePhone(true)}>
            <View style={styles.menuIconBox}>
              <Ionicons name="call-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.menuItemText}>Changer de numéro de téléphone</Text>
            <Ionicons name="chevron-forward" size={20} color="#666666" />
          </TouchableOpacity>

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

      <ChangePhoneModal visible={showChangePhone} onClose={() => setShowChangePhone(false)} />
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
    paddingVertical: 32,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#333333',
  },
  avatarPlaceholder: {
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 36,
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
  userName: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  userUsername: { color: '#A0A0A0', fontSize: 16, marginBottom: 4 },
  userEmail: { color: '#A0A0A0', fontSize: 14 },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  statLabel: {
    color: '#A0A0A0',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },

  menuSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  menuItemHighlight: {
    borderWidth: 1,
    borderColor: '#FF5A0033',
    backgroundColor: '#FF5A0008',
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuItemText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    marginBottom: 32,
  },
  logoutBtnText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  versionText: {
    color: '#666666',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 40,
  }
});

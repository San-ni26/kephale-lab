import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/index';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.replace('/welcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Mon Profil</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.profileSection}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{user?.name?.[0] || 'K'}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role === 'ARTIST' ? 'Artiste' : 'Auditeur'}</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {user?.role !== 'ARTIST' && user?.role !== 'ADMIN' && (
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/become-artist')}>
            <Ionicons name="mic-outline" size={20} color="#FF5A00" style={{ marginRight: 12 }} />
            <Text style={styles.menuItemText}>Devenir Artiste</Text>
          </TouchableOpacity>
        )}
        
        {user?.role === 'ARTIST' && (
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/upload')}>
            <Ionicons name="cloud-upload-outline" size={20} color="#FF5A00" style={{ marginRight: 12 }} />
            <Text style={styles.menuItemText}>Uploader un titre</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: 12 }} />
          <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: { width: 60 },
  backButtonText: { color: '#8B5CF6', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  
  profileSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  avatarFallback: { backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 40, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  email: { color: '#9CA3AF', fontSize: 14, marginBottom: 12 },
  roleBadge: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  roleText: { color: '#8B5CF6', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  menu: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  menuItem: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  menuItemText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

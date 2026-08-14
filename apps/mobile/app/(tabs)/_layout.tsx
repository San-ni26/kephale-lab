import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { chatAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import { getGlobalSocket } from '../../src/lib/socket';

import MiniPlayer from '../../src/components/MiniPlayer';
import PhoneRequiredModal from '../../src/components/PhoneRequiredModal';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + (insets.bottom > 0 ? insets.bottom : 10);
  
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  // Ref pour éviter la redirection au premier montage (hydration)
  const prevAuthRef = useRef(isAuthenticated);

  // ── Redirection automatique au logout ──────────────────────────────────
  // Sans ce useEffect, l'utilisateur reste bloqué sur les tabs après
  // déconnexion car Expo Router ne navigue pas automatiquement.
  // Les queries TanStack continuent de s'exécuter avec un token nul
  // et l'app reste en état de chargement infini.
  useEffect(() => {
    if (prevAuthRef.current && !isAuthenticated) {
      // L'utilisateur vient de se déconnecter : vider le cache des queries
      // privées avant de rediriger pour éviter tout flash de données
      queryClient.removeQueries({ queryKey: ['my-purchases'] });
      queryClient.removeQueries({ queryKey: ['my-notifications'] });
      queryClient.removeQueries({ queryKey: ['unread-count'] });
      queryClient.removeQueries({ queryKey: ['conversations'] });
      // Rediriger vers l'écran de bienvenue
      router.replace('/(auth)/welcome' as any);
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, queryClient]);

  const { data: unreadData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => chatAPI.getUnreadCount(),
    enabled: isAuthenticated,
  });
  const unreadCount = unreadData?.data?.data?.unreadCount || 0;

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getGlobalSocket();
    if (!socket) return;

    const handleUpdate = (data: any) => {
      // Re-fetch unread count and conversations on any user update
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('user:update', handleUpdate);
    return () => {
      socket.off('user:update', handleUpdate);
    };
  }, [isAuthenticated, queryClient]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: insets.bottom > 0 ? insets.bottom : 10 }],
          tabBarActiveTintColor: '#FF5A00', // Orange primary
          tabBarInactiveTintColor: '#6B7280',
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Bibliothèque',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reels"
          options={{
            title: 'Reels',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "film" : "film-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarBadgeStyle: { backgroundColor: '#FF5A00', color: '#FFF' },
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "chatbubble" : "chatbubble-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="premium"
          options={{
            href: null,
            title: 'Premium',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "star" : "star-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer tabBarHeight={tabBarHeight} />
      <PhoneRequiredModal />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#111111',
    borderTopColor: '#1F1F1F',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});

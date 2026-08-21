import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { ToastProvider } from '../src/components/ToastContext';
import { CustomAlertProvider } from '../src/components/CustomAlertProvider';
import { useAuthStore } from '../src/stores';
import { useOfflineStore } from '../src/stores/offlineStore';
import { initGlobalSocket, disconnectGlobalSocket } from '../src/lib/socket';
import { userAPI } from '../src/lib/api';
import { fetchAdMobConfig } from '../src/lib/ads';
import GlobalAudioPlayer from '../src/components/GlobalAudioPlayer';
import { getAccessToken, getRefreshToken } from '../src/lib/secureStorage';


// Push Notifications nécessitent un Development Client (pas supporté en Expo Go).
// Constants.appOwnership === 'expo' dans Expo Go, absent en Dev Build / production.
const isDevClient = Constants.appOwnership !== 'expo';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes fresh
      gcTime: 1000 * 60 * 30, // 30 minutes in memory
      retry: 1, // Fast failure on bad networks
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export default function RootLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(async () => {
      setHydrated(true);
      // Fetch live AdMob config from admin backend (fire-and-forget)
      fetchAdMobConfig().catch(() => {});
      const state = useAuthStore.getState();

      // If MMKV didn't restore the tokens (e.g. after upgrade), bootstrap from SecureStore
      if (!state.accessToken || !state.refreshToken) {
        try {
          const [secureAccess, secureRefresh] = await Promise.all([
            getAccessToken(),
            getRefreshToken(),
          ]);
          if (secureAccess && secureRefresh) {
            useAuthStore.setState({
              accessToken: secureAccess,
              refreshToken: secureRefresh,
              isAuthenticated: true,
            });
          }
        } catch (e) {
          console.warn('[Auth] Erreur lecture SecureStore:', e);
        }
      }

      // Validate session with backend
      const freshState = useAuthStore.getState();
      if (freshState.isAuthenticated) {
        freshState.checkAuth().catch(() => {});
      }
    });

    const hasHydrated = useAuthStore.persist.hasHydrated();
    if (hasHydrated) {
      // Already hydrated (fast path — sync)
      setHydrated(true);
      const { isAuthenticated, checkAuth } = useAuthStore.getState();
      if (isAuthenticated) {
        checkAuth().catch(() => {});
      }
    }

    return () => { unsub(); };
  }, []);


  useEffect(() => {
    if (isAuthenticated && accessToken) {
      initGlobalSocket();
    } else {
      disconnectGlobalSocket();
    }
    return () => disconnectGlobalSocket();
  }, [isAuthenticated, accessToken]);

  // SÉCURITÉ : Nettoyage automatique des téléchargements expirés (> 30 jours)
  useEffect(() => {
    const { purgeExpiredDownloads } = useOfflineStore.getState();
    purgeExpiredDownloads().catch(() => {});
  }, []);

  // Enregistrement et écoute des Push Notifications Expo
  // Utilise des imports dynamiques pour ne pas charger expo-notifications en Expo Go
  // (le simple import statique suffit à déclencher l'erreur SDK 53 en Expo Go)
  useEffect(() => {
    if (!isAuthenticated || !isDevClient) return;

    let isMounted = true;
    const subscriptions: { remove: () => void }[] = [];

    (async () => {
      try {
        // Import dynamique : le module n'est JAMAIS chargé en Expo Go
        const Notifications = await import('expo-notifications');
        const { registerForPushNotificationsAsync, handleNotificationResponse } = await import('../src/lib/notifications');

        if (!isMounted) return;

        const token = await registerForPushNotificationsAsync();
        if (token && isMounted) {
          userAPI.updatePushToken(token).catch((err) => {
            console.warn('[Push] Erreur synchronisation token backend:', err);
          });
        }

        // Notification reçue en avant-plan
        const notifSub = Notifications.addNotificationReceivedListener(() => {
          queryClient.invalidateQueries({ queryKey: ['my-notifications'] });
        });
        subscriptions.push(notifSub);

        // Clic sur une notification
        const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
          handleNotificationResponse(response);
        });
        subscriptions.push(responseSub);
      } catch (err) {
        // Silencieux : erreurs attendues en Expo Go ou si les permissions sont refusées
        console.log('[Push] Notifications non disponibles dans cet environnement.');
      }
    })();

    return () => {
      isMounted = false;
      subscriptions.forEach((s) => s.remove());
    };
  }, [isAuthenticated]);

  if (!hydrated) {
    return null; // Ne pas rendre l'app tant que le state auth n'est pas hydraté
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={Constants.expoConfig?.extra?.stripePublishableKey || ''}
        merchantIdentifier="merchant.app.kephale"
      >
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="track/[id]"
                options={{ presentation: 'modal', headerShown: false }}
              />

              <Stack.Screen
                name="artist/[id]"
                options={{ headerShown: false }}
              />
            </Stack>
            <GlobalAudioPlayer />
            <CustomAlertProvider />
          </ToastProvider>
        </QueryClientProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}

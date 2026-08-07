import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useAuthStore.persist.hasHydrated());
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      initGlobalSocket();
    } else {
      disconnectGlobalSocket();
    }
    return () => disconnectGlobalSocket();
  }, [isAuthenticated]);

  // SÉCURITÉ : Nettoyage automatique des téléchargements expirés (> 30 jours)
  useEffect(() => {
    const { purgeExpiredDownloads } = useOfflineStore.getState();
    purgeExpiredDownloads().catch(() => {});
  }, []);

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
            <CustomAlertProvider />
          </ToastProvider>
        </QueryClientProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}

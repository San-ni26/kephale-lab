import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import api from './api';

// Lazy import : expo-notifications est chargé uniquement en Development Client
// pour éviter le crash Expo Go (SDK 53+)
type NotificationsModule = typeof import('expo-notifications');

let _notificationsModule: NotificationsModule | null = null;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (_notificationsModule) return _notificationsModule;
  const isDevClient = Constants.appOwnership !== 'expo';
  if (!isDevClient) return null;
  try {
    _notificationsModule = await import('expo-notifications');

    // Configure le gestionnaire de notifications en premier plan
    _notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    return _notificationsModule;
  } catch {
    return null;
  }
}

/**
 * Demande les permissions et récupère le token Expo Push de l'appareil.
 * Enregistre automatiquement le token sur le backend pour activer les notifications.
 * Ne fait rien si l'app tourne dans Expo Go.
 *
 * @param isAuthenticated Passer true seulement si l'utilisateur est connecté
 */
export async function registerForPushNotificationsAsync(
  isAuthenticated = false
): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  let token: string | null = null;

  try {
    // Configuration spécifique à Android (canaux de notifications)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications Kephale',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF5A00',
        enableLights: true,
        enableVibrate: true,
        sound: 'default',
      });
    }

    // Vérification et demande des permissions
    const settings = await Notifications.getPermissionsAsync();
    let isGranted =
      Boolean((settings as any)?.granted) ||
      (settings as any)?.status === 'granted' ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!isGranted) {
      const requestSettings = await Notifications.requestPermissionsAsync();
      isGranted =
        Boolean((requestSettings as any)?.granted) ||
        (requestSettings as any)?.status === 'granted' ||
        requestSettings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!isGranted) {
      if (__DEV__) console.log('[Notifications] Permission refusée pour les notifications push');
      return null;
    }

    // Récupération de l'identifiant du projet Expo (EAS)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'c27d4283-7031-45e9-a8b4-d1b90dae91fa';

    const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = pushTokenData.data;

    if (__DEV__) console.log('[Notifications] Push Token Expo obtenu :', token);

    // ── Enregistrer le token sur le backend ──────────────────────────────────
    // Seulement si l'utilisateur est connecté (token JWT disponible)
    if (isAuthenticated && token) {
      try {
        await api.post('/notifications/push-token', { token });
        if (__DEV__) console.log('[Notifications] Token push enregistré sur le backend ✅');
      } catch (err: any) {
        // Non critique — réessayer au prochain démarrage
        if (__DEV__) console.warn('[Notifications] Échec enregistrement token sur backend :', err?.message);
      }
    }
  } catch (error: any) {
    console.warn('[Notifications] Erreur lors de l\'enregistrement push notifications :', error?.message || error);
  }

  return token;
}

/**
 * Supprime le token push du backend au logout
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await api.delete('/notifications/push-token');
    if (__DEV__) console.log('[Notifications] Token push supprimé du backend');
  } catch {
    // Silencieux — non critique
  }
}


/**
 * Gère l'interaction de l'utilisateur lorsqu'il clique sur une notification reçue.
 */
export function handleNotificationResponse(response: any) {
  try {
    const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
    if (!data) return;

    console.log('[Notifications] Action sur notification avec data :', data);

    if (data.url && typeof data.url === 'string') {
      router.push(data.url as any);
      return;
    }

    const type = data.type;
    const targetId = data.trackId || data.albumId || data.videoId || data.liveId || data.conversationId || data.id;

    if (type === 'NEW_TRACK' && targetId) {
      router.push(`/track/${targetId}` as any);
    } else if (type === 'NEW_ALBUM' && targetId) {
      router.push(`/album/${targetId}` as any);
    } else if ((type === 'NEW_VIDEO' || type === 'NEW_CLIP') && targetId) {
      router.push(`/clip/${targetId}` as any);
    } else if ((type === 'LIVE' || type === 'LIVE_START') && targetId) {
      router.push(`/live/${targetId}` as any);
    } else if (type === 'CHAT_MESSAGE' && targetId) {
      router.push(`/chat/${targetId}` as any);
    } else if (type === 'ARTIST_UPDATE' && data.artistId) {
      router.push(`/artist/${data.artistId}` as any);
    } else {
      router.push('/notifications');
    }
  } catch (err) {
    console.warn('[Notifications] Erreur lors de la redirection après clic notification :', err);
  }
}

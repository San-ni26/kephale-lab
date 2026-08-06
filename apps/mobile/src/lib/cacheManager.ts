import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import { useAuthStore, usePlayerStore, useUIStore } from '../stores';

/**
 * Calcule la taille totale estimée du répertoire de cache en Mo
 */
export async function getAppCacheSize(): Promise<{ sizeInBytes: number; formattedSize: string }> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return { sizeInBytes: 0, formattedSize: '0 Mo' };

    let totalSize = 0;
    const info = await FileSystem.getInfoAsync(cacheDir);
    if (!info.exists) return { sizeInBytes: 0, formattedSize: '0 Mo' };

    const files = await FileSystem.readDirectoryAsync(cacheDir);
    for (const file of files) {
      const fileUri = `${cacheDir}${file}`;
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists && !fileInfo.isDirectory && (fileInfo as any).size) {
          totalSize += (fileInfo as any).size;
        }
      } catch {}
    }

    const mb = totalSize / (1024 * 1024);
    const formatted = mb < 0.1 ? '< 1 Mo' : `${mb.toFixed(1)} Mo`;
    return { sizeInBytes: totalSize, formattedSize: formatted };
  } catch (e) {
    return { sizeInBytes: 0, formattedSize: '0 Mo' };
  }
}

/**
 * Supprime l'intégralité du cache de l'application :
 * - Cache images mémoire & disque (expo-image)
 * - Cache de fichiers temporaires (expo-file-system : vignettes, audios, vidéos)
 * - Arrêt et déchargement des players audio / vidéo
 * - Cache réseau / requêtes (TanStack Query)
 * - Optionnellement le stockage local et l'état d'authentification
 */
export async function clearEntireAppCache(options: {
  clearAuth?: boolean;
  clearAllStorage?: boolean;
  queryClient?: any;
} = {}): Promise<void> {
  const { clearAuth = false, clearAllStorage = false, queryClient } = options;

  try {
    // 1. Nettoyer le cache d'images expo-image
    try {
      await Image.clearDiskCache();
      Image.clearMemoryCache();
    } catch (e) {
      console.warn('[CacheManager] Erreur nettoyage expo-image:', e);
    }

    // 2. Nettoyer les fichiers temporaires dans FileSystem.cacheDirectory
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        for (const file of files) {
          try {
            await FileSystem.deleteAsync(`${cacheDir}${file}`, { idempotent: true });
          } catch {}
        }
      }
    } catch (e) {
      console.warn('[CacheManager] Erreur nettoyage FileSystem:', e);
    }

    // 3. Stopper le player audio s'il est en cours
    try {
      const playerStore = usePlayerStore.getState() as any;
      if (playerStore && typeof playerStore.stop === 'function') {
        playerStore.stop();
      } else if (playerStore && typeof playerStore.pause === 'function') {
        playerStore.pause();
      }
    } catch {}

    // 4. Vider le cache de requêtes TanStack Query
    if (queryClient) {
      try {
        queryClient.clear();
      } catch {}
    }

    // 5. Nettoyer le stockage / Déconnexion si demandé
    if (clearAllStorage) {
      try {
        await AsyncStorage.clear();
      } catch (e) {
        console.warn('[CacheManager] Erreur vidage AsyncStorage:', e);
      }
    }

    if (clearAuth) {
      try {
        useAuthStore.getState().logout();
      } catch {}
    }
  } catch (err) {
    console.error('[CacheManager] Erreur générale:', err);
  }
}

/**
 * Ouvre directement la page des paramètres de l'application dans les réglages du smartphone
 * pour permettre à l'utilisateur de modifier/réinitialiser les autorisations système (Caméra, Micro, Galerie, Notifications).
 */
export async function openAppSettingsPermissions(): Promise<void> {
  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await Linking.openSettings();
    }
  } catch (err) {
    console.error('[CacheManager] Impossible d\'ouvrir les paramètres:', err);
  }
}

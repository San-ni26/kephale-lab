/**
 * Storage Engine MMKV ultra-performant pour Zustand & Kephale
 *
 * Avantages de MMKV :
 * - Synchrone (aucun délai d'attente async lors de l'accès et de l'hydratation du state)
 * - Mémorisation directe C++ via JSI (jusqu'à 30x plus rapide qu'AsyncStorage)
 * - Partitionnement par ID pour isoler Auth, UI, et Offline
 * - Fallback transparent si exécuté dans un environnement sans support natif
 */

import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

// Instances MMKV dédiées
let authStorageInstance: MMKV | null = null;
let uiStorageInstance: MMKV | null = null;
let offlineStorageInstance: MMKV | null = null;
let defaultStorageInstance: MMKV | null = null;

let isMMKVAvailable = false;

try {
  authStorageInstance = new MMKV({ id: 'kephale-auth' });
  uiStorageInstance = new MMKV({ id: 'kephale-ui' });
  offlineStorageInstance = new MMKV({ id: 'kephale-offline' });
  defaultStorageInstance = new MMKV({ id: 'kephale-default' });
  isMMKVAvailable = true;
} catch (e) {
  console.warn('[Storage] MMKV natif non disponible dans cet environnement, utilisation du fallback mémoire:', e);
  isMMKVAvailable = false;
}

export { isMMKVAvailable };

// Adaptateur synchrone pour Zustand createJSONStorage
function createMMKVStorage(storageInstance: MMKV | null): StateStorage {
  const inMemoryMap = new Map<string, string>();

  return {
    getItem: (name: string): string | null => {
      if (storageInstance) {
        const val = storageInstance.getString(name);
        return val ?? null;
      }
      return inMemoryMap.get(name) ?? null;
    },
    setItem: (name: string, value: string): void => {
      if (storageInstance) {
        storageInstance.set(name, value);
      } else {
        inMemoryMap.set(name, value);
      }
    },
    removeItem: (name: string): void => {
      if (storageInstance) {
        storageInstance.delete(name);
      } else {
        inMemoryMap.delete(name);
      }
    },
  };
}

export const authPersistStorage = createMMKVStorage(authStorageInstance);
export const uiPersistStorage = createMMKVStorage(uiStorageInstance);
export const offlinePersistStorage = createMMKVStorage(offlineStorageInstance);
export const defaultPersistStorage = createMMKVStorage(defaultStorageInstance);

/**
 * Nettoie l'intégralité du stockage MMKV (utilisé par CacheManager et Logout complet)
 */
export function clearAllMMKVStorage(): void {
  try {
    authStorageInstance?.clearAll();
    uiStorageInstance?.clearAll();
    offlineStorageInstance?.clearAll();
    defaultStorageInstance?.clearAll();
    console.log('[Storage] Tout le stockage MMKV a été réinitialisé');
  } catch (err) {
    console.warn('[Storage] Erreur lors du nettoyage MMKV:', err);
  }
}

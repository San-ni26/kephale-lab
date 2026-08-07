/**
 * Secure Token Storage — expo-secure-store
 *
 * SÉCURITÉ :
 * - iOS : stockage dans le Keychain (chiffré par le Secure Enclave)
 * - Android : stockage dans le Keystore (chiffrement hardware ou software)
 * - Inaccessible même en cas de jailbreak/root basique
 * - Exclu des sauvegardes iTunes et iCloud
 *
 * Usage : réservé aux accessToken + refreshToken uniquement.
 * Les préférences UI non sensibles restent dans MMKV/AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

// Clés de stockage sécurisé
export const SECURE_KEYS = {
  ACCESS_TOKEN: 'kephale_access_token',
  REFRESH_TOKEN: 'kephale_refresh_token',
} as const;

/**
 * Enregistre le token d'accès de manière sécurisée.
 */
export async function saveAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, token);
}

/**
 * Récupère le token d'accès depuis le stockage sécurisé.
 */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
}

/**
 * Enregistre le refresh token de manière sécurisée.
 */
export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, token);
}

/**
 * Récupère le refresh token depuis le stockage sécurisé.
 */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
}

/**
 * Supprime les deux tokens (logout complet).
 */
export async function clearSecureTokens(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
  ]);
}

/**
 * StateStorage compatible Zustand persist, utilisant expo-secure-store.
 *
 * Note : expo-secure-store est asynchrone — compatible avec createJSONStorage() de Zustand.
 * ATTENTION : ne stocker que les tokens ici, pas l'objet user complet.
 */
export const secureTokenStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (err) {
      console.warn('[SecureStorage] getItem error:', err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (err) {
      console.warn('[SecureStorage] setItem error:', err);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (err) {
      console.warn('[SecureStorage] removeItem error:', err);
    }
  },
};

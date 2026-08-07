/**
 * Storage Adapter universel pour Zustand
 * Utilise AsyncStorage (100% stable sur EAS et Expo Go)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

export const isMMKVAvailable = false; // Backward compatibility with any checks in the code

function createPersistStorage(id: string): StateStorage {
  return {
    getItem: async (name: string) => {
      return await AsyncStorage.getItem(name);
    },
    setItem: async (name: string, value: string) => {
      await AsyncStorage.setItem(name, value);
    },
    removeItem: async (name: string) => {
      await AsyncStorage.removeItem(name);
    }
  };
}

export const authPersistStorage = createPersistStorage('kephale-auth');
export const uiPersistStorage = createPersistStorage('kephale-ui');

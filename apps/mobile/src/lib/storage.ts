/**
 * Storage Adapter universel : MMKV (build natif) + AsyncStorage fallback (Expo Go)
 *
 * MMKV v4 (Nitro) est ~30x plus rapide qu'AsyncStorage — synchrone, JSI, memory-mapped.
 * Il nécessite un build natif (Dev Client ou EAS). En Expo Go, fallback AsyncStorage.
 */

import type { StateStorage } from 'zustand/middleware';
import type { MMKV as MMKVType } from 'react-native-mmkv';

// ── Détection MMKV v4 (createMMKV API) ───────────────────────────────────────

type CreateMMKVFn = (config: { id: string }) => MMKVType;

let _createMMKV: CreateMMKVFn | null = null;
let _mmkvAvailable = false;

try {
  _createMMKV = require('react-native-mmkv').createMMKV as CreateMMKVFn;
  // Test fonctionnel de l'instance
  const testInstance = _createMMKV({ id: '__mmkv_test__' });
  testInstance.set('__test__', '1');
  testInstance.remove('__test__');
  _mmkvAvailable = true;
  console.info('[Storage] MMKV v4 actif (JSI synchrone)');
} catch {
  _createMMKV = null;
  _mmkvAvailable = false;
  console.info('[Storage] MMKV non disponible -> fallback AsyncStorage (Expo Go détecté)');
}

export const isMMKVAvailable = _mmkvAvailable;

// ── Adapter MMKV v4 ───────────────────────────────────────────────────────────

class MMKVStorageAdapter implements StateStorage {
  private instance: MMKVType;

  constructor(id: string) {
    if (!_createMMKV) throw new Error('MMKV not available');
    this.instance = _createMMKV({ id });
  }

  getItem(name: string): string | null {
    return this.instance.getString(name) ?? null;
  }

  setItem(name: string, value: string): void {
    this.instance.set(name, value);
  }

  removeItem(name: string): void {
    this.instance.remove(name); // v4: remove() au lieu de delete()
  }
}

// ── Fallback AsyncStorage (Expo Go) ──────────────────────────────────────────
//
// AsyncStorage est asynchrone, mais Zustand persist accepte les deux.
// On utilise un cache mémoire pour simuler la synchronicité sur getItem(),
// et on flush les écritures de manière asynchrone avec debounce.

class AsyncStorageFallback implements StateStorage {
  private cache = new Map<string, string>();
  private pendingWrites = new Map<string, string | null>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, 30);
  }

  private async flush() {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const entries = Array.from(this.pendingWrites.entries());
    this.pendingWrites.clear();
    await Promise.allSettled(
      entries.map(([key, value]) =>
        value === null
          ? AsyncStorage.removeItem(key)
          : AsyncStorage.setItem(key, value)
      )
    );
  }

  getItem(name: string): string | null {
    if (!this.initialized) {
      // Premier accès: lancer l'hydration asynchrone en arrière-plan
      this.initFromAsyncStorage(name);
    }
    return this.cache.get(name) ?? null;
  }

  private async initFromAsyncStorage(name: string) {
    this.initialized = true;
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const value = await AsyncStorage.getItem(name);
      if (value !== null && !this.cache.has(name)) {
        this.cache.set(name, value);
      }
    } catch {}
  }

  setItem(name: string, value: string): void {
    this.cache.set(name, value);
    this.pendingWrites.set(name, value);
    this.scheduleFlush();
  }

  removeItem(name: string): void {
    this.cache.delete(name);
    this.pendingWrites.set(name, null);
    this.scheduleFlush();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createPersistStorage(id: string): StateStorage {
  if (_mmkvAvailable) {
    try {
      return new MMKVStorageAdapter(id);
    } catch {
      // En cas d'erreur au runtime, fallback
    }
  }
  return {
    getItem: async (name: string) => {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      return await AsyncStorage.getItem(name);
    },
    setItem: async (name: string, value: string) => {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(name, value);
    },
    removeItem: async (name: string) => {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem(name);
    }
  };
}

// ── Instances exportées ───────────────────────────────────────────────────────

export const authPersistStorage = createPersistStorage('kephale-auth');
export const uiPersistStorage = createPersistStorage('kephale-ui');

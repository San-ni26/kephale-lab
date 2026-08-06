import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authPersistStorage, uiPersistStorage } from '../lib/storage';
import type { User, AuthTokens } from '@kephale/types';

// Import lazy pour éviter la circularité stores ↔ api
let _userAPI: any = null;
const getUserAPI = () => {
  if (!_userAPI) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _userAPI = require('../lib/api').userAPI;
  }
  return _userAPI;
};

// ── Auth Store ────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, tokens: AuthTokens) => void;
  updateUser: (user: Partial<User>) => void;
  checkAuth: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, tokens) =>
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
        }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      checkAuth: async () => {
        try {
          const userAPI = getUserAPI();
          const res = await userAPI.getMe();
          if (res.data?.success && res.data?.data) {
            set((state) => ({
              user: { ...state.user, ...res.data.data },
            }));
          }
        } catch (e) {
          // Silently ignore auth check errors (user may not be connected)
        }
      },
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-state',
      storage: createJSONStorage(() => authPersistStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ── Player Store ──────────────────────────────────────────────────────────────
// Pas de persistance — état éphémère entre sessions

import type { Track } from '@kephale/types';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  isVisible: boolean;
  progress: number;      // 0–1
  duration: number;      // seconds
  setTrack: (track: Track, queue?: Track[]) => void;
  setPlaying: (isPlaying: boolean) => void;
  setProgress: (progress: number, duration: number) => void;
  setVisible: (visible: boolean) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  isVisible: false,
  progress: 0,
  duration: 0,
  setTrack: (track, queue = []) =>
    set({ currentTrack: track, queue, isPlaying: true, isVisible: true }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setProgress: (progress, duration) => set({ progress, duration }),
  setVisible: (visible) => set({ isVisible: visible }),
  nextTrack: () => {
    const { queue, currentTrack } = get();
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const next = queue[idx + 1];
    if (next) set({ currentTrack: next, isPlaying: true });
  },
  prevTrack: () => {
    const { queue, currentTrack } = get();
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prev = queue[idx - 1];
    if (prev) set({ currentTrack: prev, isPlaying: true });
  },
  clearPlayer: () =>
    set({ currentTrack: null, queue: [], isPlaying: false, isVisible: false, progress: 0, duration: 0 }),
}));

// ── UI Store ──────────────────────────────────────────────────────────────────

interface UIState {
  preferredCurrency: string;
  country: string;
  hasSeenOnboarding: boolean;
  setPreferredCurrency: (currency: string) => void;
  setCountry: (country: string) => void;
  setHasSeenOnboarding: (seen: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      preferredCurrency: 'EUR',
      country: 'SN', // Senegal default
      hasSeenOnboarding: false,
      setPreferredCurrency: (currency) => set({ preferredCurrency: currency }),
      setCountry: (country) => set({ country }),
      setHasSeenOnboarding: (seen) => set({ hasSeenOnboarding: seen }),
    }),
    {
      name: 'ui-state',
      storage: createJSONStorage(() => uiPersistStorage),
    }
  )
);

export { useOfflineStore } from './offlineStore';

// ── Chat Store (Offline Cache) ───────────────────────────────────────────────

interface ChatState {
  messagesCache: Record<string, any[]>;
  cacheMessages: (conversationId: string, messages: any[]) => void;
  addMessage: (conversationId: string, message: any) => void;
  deleteMessageFromCache: (conversationId: string, messageId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messagesCache: {},
      cacheMessages: (conversationId, messages) =>
        set((state) => ({
          messagesCache: { ...state.messagesCache, [conversationId]: messages },
        })),
      addMessage: (conversationId, message) =>
        set((state) => {
          const old = state.messagesCache[conversationId] || [];
          if (old.find((m) => m.id === message.id)) return state;
          return {
            messagesCache: { ...state.messagesCache, [conversationId]: [...old, message] },
          };
        }),
      deleteMessageFromCache: (conversationId, messageId) =>
        set((state) => {
          const old = state.messagesCache[conversationId] || [];
          return {
            messagesCache: {
              ...state.messagesCache,
              [conversationId]: old.map((m) => (m.id === messageId ? { ...m, isDeleted: true } : m)),
            },
          };
        }),
    }),
    {
      name: 'kephale-chat-cache',
      storage: createJSONStorage(() => uiPersistStorage),
    }
  )
);

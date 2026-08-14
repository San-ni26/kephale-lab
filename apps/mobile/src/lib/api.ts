import axios from 'axios';
import Constants from 'expo-constants';
import { rewriteUrlsInObject } from './url';

export const getDynamicApiUrl = () => {
  // If remote HTTPS API URL is configured (e.g. staging or production)
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.startsWith('https://')) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Auto-detect host IP from Expo Metro connection (works dynamically with any LAN / Wi-Fi IP)
  const host = Constants.expoConfig?.hostUri?.split(':')?.[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000`;
  }
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Constants.expoConfig?.extra?.apiUrl) return Constants.expoConfig.extra.apiUrl;
  return 'http://localhost:4000';
};

const API_URL = getDynamicApiUrl();
if (__DEV__) {
  console.log('[Kephale API] Connecting to backend at:', API_URL);
}

const getAuthStore = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../stores/index').useAuthStore;
};

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let anonymousSessionId = '';
function getAnonymousSessionId(): string {
  if (!anonymousSessionId) {
    anonymousSessionId = 'anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
  return anonymousSessionId;
}

// ── Request Interceptor (inject token & session ID) ──────────────────────────

api.interceptors.request.use(
  (config) => {
    try {
      const token = getAuthStore().getState().accessToken;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch { }
    config.headers['X-Session-ID'] = getAnonymousSessionId();
    if (__DEV__) console.log(`[AXIOS] Sending request to: ${config.url}`);
    return config;
  },
  (error) => {
    if (__DEV__) console.error(`[AXIOS] Request error:`, error);
    return Promise.reject(error);
  }
);

// ── Response Interceptor (auto refresh token) ─────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => {
    if (__DEV__) console.log(`[AXIOS] Received response from: ${response.config.url} (status: ${response.status})`);
    if (response.data) {
      const originalData = rewriteUrlsInObject(response.data);
      
      if (typeof originalData === 'object' && originalData !== null && !('success' in originalData) && !('data' in originalData)) {
        response.data = new Proxy(originalData, {
          get(target, prop) {
            if (prop === 'success') return true;
            if (prop === 'data') return target;
            return Reflect.get(target, prop);
          }
        });
      } else {
        response.data = originalData;
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest._retry = true;
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getAuthStore().getState().refreshToken;

      if (!refreshToken) {
        getAuthStore().getState().logout();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = response.data.data;

        getAuthStore().setState({ accessToken, refreshToken: newRefreshToken });

        processQueue(null, accessToken);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        getAuthStore().getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status !== 401 && error.response?.status !== 403) {
      if (__DEV__) console.error(`[AXIOS] Response error for ${error.config?.url}:`, error.message);
    }
    return Promise.reject(error);
  }
);

// ── API Functions ─────────────────────────────────────────────────────────────

export const authAPI = {
  loginWithGoogle: (idToken: string) =>
    api.post('/auth/google', { idToken }),
  loginWithEmail: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  registerWithEmail: (data: { email: string; password: string; name: string; username?: string; phoneNumber?: string }) =>
    api.post('/auth/register', data),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (data: { email: string; otp: string; password: string }) =>
    api.post('/auth/reset-password', data),
};

export const tracksAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/tracks', { params }),
  mine: (params?: Record<string, unknown>) =>
    api.get('/tracks/mine', { params }),
  get: (id: string) =>
    api.get(`/tracks/${id}`),
  getById: (id: string) =>
    api.get(`/tracks/${id}`),
  getStreamUrl: (id: string) =>
    api.get(`/tracks/${id}/stream`),
  // SÉCURITÉ : Endpoint sécurisé pour le téléchargement offline
  // Vérifie l'accès côté serveur et retourne une URL signée à courte durée de vie
  getDownloadUrl: (id: string) =>
    api.get(`/tracks/${id}/download`),
  play: (id: string) =>
    api.post(`/tracks/${id}/play`),
  create: (data: Record<string, unknown>) =>
    api.post('/tracks', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/tracks/${id}`, data),
  delete: (id: string) =>
    api.delete(`/tracks/${id}`),
  like: (id: string) =>
    api.post(`/tracks/${id}/like`),
};

export const albumsAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/albums', { params }),
  mine: (params?: Record<string, unknown>) =>
    api.get('/albums/mine', { params }),
  get: (id: string) =>
    api.get(`/albums/${id}`),
  getById: (id: string) =>
    api.get(`/albums/${id}`),
  getStatus: (id: string) =>
    api.get(`/albums/${id}/status`),
  create: (data: Record<string, unknown>) =>
    api.post('/albums', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/albums/${id}`, data),
  delete: (id: string) =>
    api.delete(`/albums/${id}`),
  addTrack: (albumId: string, trackId: string) =>
    api.post(`/albums/${albumId}/tracks`, { trackId }),
  removeTrack: (albumId: string, trackId: string) =>
    api.delete(`/albums/${albumId}/tracks/${trackId}`),
};

export const artistsAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/artists', { params }),
  get: (id: string) =>
    api.get(`/artists/${id}`),
  getById: (id: string) =>
    api.get(`/artists/${id}`),
  getStats: (id: string) =>
    api.get(`/artists/${id}/stats`),
  getTracks: (id: string, params?: Record<string, unknown>) =>
    api.get(`/artists/${id}/tracks`, { params }),
  getAlbums: (id: string) =>
    api.get(`/artists/${id}/albums`),
  getVideos: (id: string, params?: Record<string, unknown>) =>
    api.get(`/artists/${id}/videos`, { params }),
  createProfile: (data: Record<string, unknown>) =>
    api.post('/artists', data),
  updateProfile: (data: Record<string, unknown>) =>
    api.patch('/artists/me', data),
  getDashboard: () =>
    api.get('/artists/me/dashboard'),
  getSales: () =>
    api.get('/artists/me/sales'),
  getWithdrawals: () =>
    api.get('/artists/me/withdrawals'),
  requestWithdrawalOtp: () =>
    api.post('/artists/me/withdrawals/request-otp'),
  requestWithdrawal: (data: { amount: number; paymentMethod: string; paymentDetails: string; otp?: string }) =>
    api.post('/artists/me/withdrawals', data),
  cancelWithdrawal: (id: string) =>
    api.delete(`/artists/me/withdrawals/${id}`),
  follow: (id: string) => api.post(`/artists/${id}/follow`),
  unfollow: (id: string) => api.delete(`/artists/${id}/follow`),
  getFollowStatus: (id: string) => api.get(`/artists/${id}/follow-status`),
  updateNotifications: (id: string, data: any) => api.patch(`/artists/${id}/notifications`, data),
};

export const playlistsAPI = {
  list: () => api.get('/playlists'),
  getById: (id: string) => api.get(`/playlists/${id}`),
  create: (title: string) => api.post('/playlists', { title }),
  update: (id: string, title: string) => api.patch(`/playlists/${id}`, { title }),
  delete: (id: string) => api.delete(`/playlists/${id}`),
  addTrack: (playlistId: string, trackId: string) => api.post(`/playlists/${playlistId}/tracks`, { trackId }),
  removeTrack: (playlistId: string, trackId: string) => api.delete(`/playlists/${playlistId}/tracks/${trackId}`),
};

export const videosAPI = {
  list: (params?: Record<string, unknown>) =>
    api.get('/videos', { params }),
  mine: (params?: Record<string, unknown>) =>
    api.get('/videos/mine', { params }),
  getById: (id: string) =>
    api.get(`/videos/${id}`),
  getStreamUrl: (id: string) =>
    api.get(`/videos/${id}/stream`),
  // SÉCURITÉ : Endpoint sécurisé pour le téléchargement offline
  getDownloadUrl: (id: string) =>
    api.get(`/videos/${id}/download`),
  getComments: (id: string, params?: Record<string, unknown>) =>
    api.get(`/videos/${id}/comments`, { params }),
  create: (data: Record<string, unknown>) =>
    api.post('/videos', data, { timeout: 60000 }),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/videos/${id}`, data, { timeout: 60000 }),
  delete: (id: string) =>
    api.delete(`/videos/${id}`),
  like: (id: string) =>
    api.post(`/videos/${id}/like`),
  comment: (id: string, content: string) =>
    api.post(`/videos/${id}/comment`, { content }),
  watch: (id: string, data: { watchDurationSec: number; completed: boolean }) =>
    api.post(`/videos/${id}/watch`, data),
  verifyAudioRights: (data: { trackId?: string; audioTitle?: string; videoS3Key?: string; videoUrl?: string; originalAudioName?: string; title?: string; description?: string }) =>
    api.post('/videos/verify-audio-rights', data, { timeout: 90000 }),
  /**
   * Vérification instantanée par hash SHA-256 du fichier (< 200ms).
   * À appeler IMMÉDIATEMENT après la sélection du fichier vidéo, avant le pré-upload.
   */
  checkAudioHash: (data: { sha256Prefix: string; filename: string; fileSize: number }) =>
    api.post('/videos/check-audio-hash', data, { timeout: 5000 }),

};

export const livesAPI = {
  create: (data: any) => api.post('/lives', data),
  start: (id: string) => api.post(`/lives/${id}/start`),
  join: (id: string) => api.post(`/lives/${id}/join`),
  end: (id: string) => api.post(`/lives/${id}/end`),
  list: (params?: { search?: string }) => api.get('/lives', { params }),
  like: (id: string) => api.post(`/lives/${id}/like`),
  gift: (id: string, data: { tokens: number; message?: string }) => api.post(`/lives/${id}/gift`, data),
  report: (id: string, data: { reason: string }) => api.post(`/lives/${id}/report`, data),
  requestJoin: (id: string) => api.post(`/lives/${id}/participants/request`),
  approveParticipant: (id: string, userId: string) => api.post(`/lives/${id}/participants/${userId}/approve`),
  delete: (id: string) => api.delete(`/lives/${id}`),
};

export const purchasesAPI = {
  payWithTokens: (data: { type: 'TRACK' | 'ALBUM' | 'CLIP'; itemId: string }) => {
    return api.post('/payments/pay-with-tokens', data);
  },
  // On garde createIntent si nécessaire pour acheter des packs de jetons
  createIntent: (data: { packId: string; currency?: string; paymentProvider?: 'STRIPE' | 'CINETPAY' }) => {
    return api.post('/payments/buy-tokens', data);
  },
};

export const feedAPI = {
  getFeed: () => api.get('/feed'),
};

export const paymentsAPI = {
  getCurrencies: () => api.get('/payments/currencies'),
  getTokenPacks: (currency: string = 'XOF') =>
    api.get('/payments/token-packs', { params: { currency } }),
  buyTokens: (packId: string, currency: string = 'XOF', paymentProvider: 'STRIPE' | 'CINETPAY' = 'CINETPAY') =>
    api.post('/payments/buy-tokens', { packId, currency, paymentProvider }),
  buyTrack: (trackId: string, currency: string) =>
    api.post('/payments/buy-track', { trackId, currency }),
  convert: (amount: number, fromCurrency: string = 'XOF', toCurrency?: string) =>
    api.post('/payments/convert', { amount, fromCurrency, toCurrency }),
  getTokenHistory: (params?: { page?: number; limit?: number; type?: string }) =>
    api.get('/payments/token-history', { params }),
};

export const userAPI = {
  getMe: () => api.get('/users/me'),
  updateProfile: (data: { name?: string; avatar?: string; phoneNumber?: string }) => api.put('/users/me', data),
  updatePushToken: (token: string) => api.patch('/users/me/push-token', { token }),
  deleteAccount: (data: { password?: string; artistAction?: 'TRANSFER' | 'DELETE' }) => api.delete('/users/me', { data }),
  getPurchases: () => api.get('/users/me/purchases'),
  search: (q: string) => api.get('/users/search', { params: { q } }),
  syncContacts: (phoneNumbers: string[]) => api.post('/users/sync-contacts', { phoneNumbers }),
};

export const chatAPI = {
  getConversations: () => api.get('/chat/conversations'),
  requestConversation: (targetUserId: string, message: string) =>
    api.post('/chat/request', { targetUserId, message }),
  acceptConversation: (id: string) =>
    api.post(`/chat/conversations/${id}/accept`),
  getMessages: (id: string) =>
    api.get(`/chat/conversations/${id}/messages`),
  sendMessage: (
    id: string,
    data: { content?: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string }
  ) => api.post(`/chat/conversations/${id}/messages`, data),
  deleteConversation: (id: string) =>
    api.delete(`/chat/conversations/${id}`),
  deleteMessage: (messageId: string) =>
    api.delete(`/chat/messages/${messageId}`),
  getUnreadCount: () =>
    api.get('/chat/unread-count'),
};

export const notificationsAPI = {
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markReadAll: () => api.patch('/notifications/read-all'),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getWithdrawals: () => api.get('/admin/withdrawals'),
  updateWithdrawalStatus: (id: string, status: 'COMPLETED' | 'FAILED') =>
    api.patch(`/admin/withdrawals/${id}`, { status }),
};

export const uploadAPI = {
  getPresignedUrl: (data: { filename: string; contentType: string; type: 'audio' | 'video' | 'image' | 'document' }) =>
    api.post('/upload/presigned-url', data, { timeout: 60000 }),
};

export const subscriptionsAPI = {
  getTiers: () => api.get('/subscriptions/tiers'),
  subscribe: (tier: 'PREMIUM' | 'PREMIUM_PLUS', password?: string) => api.post('/subscriptions/subscribe', { tier, password }),
  cancel: () => api.post('/subscriptions/cancel'),
};

export const copyrightAPI = {
  report: (data: { videoId: string; trackId: string; reason?: string }) =>
    api.post('/copyright/report', data),
  myReports: () => api.get('/copyright/my-reports'),
  myStrikes: () => api.get('/copyright/my-strikes'),
};

export const adsAPI = {
  serve: (placement: 'REEL' | 'CLIP_PREROLL' | 'BANNER' | 'AUDIO_SPOT' | 'TRACK_BOOST' | 'ALBUM_BOOST', country?: string) =>
    api.get('/ads/serve', { params: { placement, country } }),
  recordImpression: (id: string, data: { userId?: string; country?: string; device?: string; watched100?: boolean }) =>
    api.post(`/ads/${id}/impression`, data),
  recordClick: (id: string, data: { userId?: string; country?: string; device?: string }) =>
    api.post(`/ads/${id}/click`, data),
  getPackages: () => api.get('/ads/packages'),
  createBoost: (data: {
    itemId: string;
    itemType: 'REEL' | 'TRACK' | 'ALBUM' | 'CLIP';
    packageId: 'DISCOVERY' | 'TRENDING' | 'VIRAL' | 'CUSTOM';
    customImpressions?: number;
    customDurationDays?: number;
    targetCountries?: string[];
    ctaText?: string;
  }) => api.post('/ads/boost', data),
  getMyCampaigns: () => api.get('/ads/my-campaigns'),
  getMyAnalytics: (id: string) => api.get(`/ads/my-analytics/${id}`),
};

export const adminAdsAPI = {
  getStats: () => api.get('/admin/ads/stats'),
  getAdvertisers: () => api.get('/admin/ads/advertisers'),
  createAdvertiser: (data: { name: string; company?: string; contactEmail?: string; contactPhone?: string; notes?: string }) =>
    api.post('/admin/ads/advertisers', data),
  updateAdvertiser: (id: string, data: any) => api.patch(`/admin/ads/advertisers/${id}`, data),
  deleteAdvertiser: (id: string) => api.delete(`/admin/ads/advertisers/${id}`),

  getCampaigns: (params?: { status?: string; placement?: string; advertiserId?: string }) =>
    api.get('/admin/ads/campaigns', { params }),
  getCampaignById: (id: string) => api.get(`/admin/ads/campaigns/${id}`),
  createCampaign: (data: any) => api.post('/admin/ads/campaigns', data),
  updateCampaign: (id: string, data: any) => api.patch(`/admin/ads/campaigns/${id}`, data),
  toggleCampaignStatus: (id: string) => api.patch(`/admin/ads/campaigns/${id}/toggle-status`),
  deleteCampaign: (id: string) => api.delete(`/admin/ads/campaigns/${id}`),
  getCampaignAnalytics: (id: string) => api.get(`/admin/ads/analytics/${id}`),
};


// Central API client for Kephale Admin Dashboard
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kephale-lab.onrender.com/api/v1';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('adminToken');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('adminToken');
    window.location.reload();
    throw new Error('Session expirée');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Une erreur est survenue');
  }
  return data.data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: any }>('POST', '/auth/login', { email, password }),

  // Stats
  getStats: () => request<any>('GET', '/admin/stats'),
  getGrowthStats: (days = 30) => request<any>('GET', `/admin/stats/growth?days=${days}`),
  getTopContent: () => request<any>('GET', '/admin/stats/content'),
  getRevenueStats: () => request<any>('GET', '/admin/stats/revenue'),

  // Users
  getUsers: (params: Record<string, string | number | boolean | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/users?${q}`);
  },
  getUserById: (id: string) => request<any>('GET', `/admin/users/${id}`),
  banUser: (id: string, ban: boolean, reason?: string) =>
    request<any>('PATCH', `/admin/users/${id}/ban`, { ban, reason }),
  changeUserRole: (id: string, role: string) =>
    request<any>('PATCH', `/admin/users/${id}/role`, { role }),
  deleteUser: (id: string) => request<any>('DELETE', `/admin/users/${id}`),
  notifyUser: (id: string, title: string, body: string) =>
    request<any>('POST', `/admin/users/${id}/notify`, { title, body }),

  // Tracks
  getTracks: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/tracks?${q}`);
  },
  updateTrackStatus: (id: string, status: string) =>
    request<any>('PATCH', `/admin/tracks/${id}/status`, { status }),
  deleteTrack: (id: string) => request<any>('DELETE', `/admin/tracks/${id}`),

  // Videos
  getVideos: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/videos?${q}`);
  },
  updateVideoStatus: (id: string, status: string) =>
    request<any>('PATCH', `/admin/videos/${id}/status`, { status }),

  // Artists
  getArtists: (params: Record<string, string | number | boolean | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/artists?${q}`);
  },
  verifyArtist: (id: string, verified: boolean) =>
    request<any>('PATCH', `/admin/artists/${id}/verify`, { verified }),
  getArtistEarnings: (id: string) => request<any>('GET', `/admin/artists/${id}/earnings`),

  // Finance
  getWithdrawals: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/withdrawals?${q}`);
  },
  updateWithdrawalStatus: (id: string, status: string) =>
    request<any>('PATCH', `/admin/withdrawals/${id}`, { status }),
  getPurchases: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/purchases?${q}`);
  },
  getSubscriptions: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/subscriptions?${q}`);
  },

  // Copyright
  getCopyrightReports: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return request<any>('GET', `/admin/copyright-reports?${q}`);
  },
  resolveCopyrightReport: (id: string, action: string, adminNote?: string) =>
    request<any>('PATCH', `/admin/copyright-reports/${id}`, { action, adminNote }),

  // Broadcast
  broadcast: (title: string, body: string, segment?: string) =>
    request<any>('POST', '/admin/broadcast', { title, body, segment: segment || 'all' }),

  // System
  getSystemHealth: () => request<any>('GET', '/admin/system/health'),
  flushCache: (pattern?: string) => request<any>('POST', '/admin/system/cache/flush', { pattern }),
};

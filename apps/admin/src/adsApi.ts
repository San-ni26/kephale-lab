// Additional admin ads API endpoints
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kephale-lab.onrender.com/api/v1';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('adminToken');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { localStorage.removeItem('adminToken'); window.location.reload(); throw new Error('Session expirée'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Erreur serveur');
  return data.data as T;
}

export const adsApi = {
  getStats: () => req<any>('GET', '/admin/ads/stats'),
  getAdvertisers: () => req<any>('GET', '/admin/ads/advertisers'),
  createAdvertiser: (body: any) => req<any>('POST', '/admin/ads/advertisers', body),
  updateAdvertiser: (id: string, body: any) => req<any>('PATCH', `/admin/ads/advertisers/${id}`, body),
  deleteAdvertiser: (id: string) => req<any>('DELETE', `/admin/ads/advertisers/${id}`),

  getCampaigns: (params?: Record<string, string>) => {
    const q = new URLSearchParams(params || {});
    return req<any>('GET', `/admin/ads/campaigns?${q}`);
  },
  getCampaignById: (id: string) => req<any>('GET', `/admin/ads/campaigns/${id}`),
  createCampaign: (body: any) => req<any>('POST', '/admin/ads/campaigns', body),
  updateCampaign: (id: string, body: any) => req<any>('PATCH', `/admin/ads/campaigns/${id}`, body),
  toggleCampaignStatus: (id: string) => req<any>('PATCH', `/admin/ads/campaigns/${id}/toggle-status`),
  deleteCampaign: (id: string) => req<any>('DELETE', `/admin/ads/campaigns/${id}`),
  getCampaignAnalytics: (id: string) => req<any>('GET', `/admin/ads/analytics/${id}`),
};

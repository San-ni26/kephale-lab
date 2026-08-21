import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'FLAGGED'];
const statusBadge = (s: string) => {
  const map: Record<string, string> = { PUBLISHED: 'badge-green', DRAFT: 'badge-gray', ARCHIVED: 'badge-yellow', FLAGGED: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
};

function TracksTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getTracks({ page, limit: 20, search: search || undefined, status: status || undefined }));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await api.updateTrackStatus(id, newStatus);
      toast.success('Statut mis à jour');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteTrack = async (id: string, title: string) => {
    if (!confirm(`Supprimer "${title}" définitivement ?`)) return;
    try {
      await api.deleteTrack(id);
      toast.success('Piste supprimée');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar">🔍<input placeholder="Chercher une piste..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="table-container">
        <div className="table-header"><span className="table-title">Pistes ({data?.total ?? '…'})</span></div>
        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <>
            <table>
              <thead><tr><th>Titre</th><th>Artiste</th><th>Écoutes</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {data?.tracks.map((t: any) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.title}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.artist?.stageName}</td>
                    <td>{(t.playCount || 0).toLocaleString()}</td>
                    <td>{statusBadge(t.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteTrack(t.id, t.title)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">{data.total} pistes • Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Préc.</button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VideosTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getVideos({ page, limit: 20, search: search || undefined, status: status || undefined }));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, newStatus: string) => {
    try { await api.updateVideoStatus(id, newStatus); toast.success('Statut mis à jour'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar">🔍<input placeholder="Chercher une vidéo..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="table-container">
        <div className="table-header"><span className="table-title">Vidéos ({data?.total ?? '…'})</span></div>
        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <>
            <table>
              <thead><tr><th>Titre</th><th>Artiste</th><th>Vues</th><th>Statut</th><th>Date</th><th>Changer</th></tr></thead>
              <tbody>
                {data?.videos.map((v: any) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500 }}>{v.title}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{v.artist?.stageName}</td>
                    <td>{(v.viewCount || 0).toLocaleString()}</td>
                    <td>{statusBadge(v.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(v.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <select value={v.status} onChange={e => updateStatus(v.id, e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">{data.total} vidéos • Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Préc.</button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ContentPage() {
  const [tab, setTab] = useState<'tracks' | 'videos'>('tracks');
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button className={`btn ${tab === 'tracks' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('tracks')}>🎵 Pistes</button>
        <button className={`btn ${tab === 'videos' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('videos')}>🎬 Vidéos</button>
      </div>
      {tab === 'tracks' ? <TracksTab /> : <VideosTab />}
    </div>
  );
}

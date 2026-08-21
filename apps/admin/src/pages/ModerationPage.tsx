import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';

export default function ModerationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [adminNote, setAdminNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getCopyrightReports({ page, limit: 20, status: statusFilter || undefined }));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (action: 'APPROVED' | 'REJECTED') => {
    if (!resolveModal) return;
    try {
      await api.resolveCopyrightReport(resolveModal.id, action, adminNote || undefined);
      toast.success(action === 'APPROVED' ? 'Signalement accepté ✅' : 'Signalement rejeté');
      setResolveModal(null);
      setAdminNote('');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { PENDING: 'badge-yellow', APPROVED: 'badge-green', REJECTED: 'badge-red' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Acceptés</option>
          <option value="REJECTED">Rejetés</option>
          <option value="">Tous</option>
        </select>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Rapports de copyright ({data?.total ?? '…'})</span>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Signaleur</th>
                  <th>Contenu signalé</th>
                  <th>Raison</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.reports.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div className="user-name">{r.reporter?.name}</div>
                      <div className="user-email">{r.reporter?.email}</div>
                    </td>
                    <td>
                      {r.video && <div style={{ fontSize: 13 }}>🎬 {r.video.title}</div>}
                      {r.track && <div style={{ fontSize: 13 }}>🎵 {r.track.title}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason || '—'}
                      </div>
                    </td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      {r.status === 'PENDING' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { setResolveModal(r); setAdminNote(''); }}>
                          🔍 Examiner
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Préc.</button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {resolveModal && (
        <div className="modal-backdrop" onClick={() => setResolveModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔍 Examiner le signalement</div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div><strong>Signaleur :</strong> {resolveModal.reporter?.name} ({resolveModal.reporter?.email})</div>
              {resolveModal.video && <div style={{ marginTop: 6 }}><strong>Vidéo :</strong> {resolveModal.video.title}</div>}
              {resolveModal.track && <div style={{ marginTop: 6 }}><strong>Piste :</strong> {resolveModal.track.title}</div>}
              <div style={{ marginTop: 6 }}><strong>Raison :</strong> {resolveModal.reason || 'Non spécifiée'}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Note interne (optionnel)</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Note visible uniquement par les admins..."
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setResolveModal(null)}>Annuler</button>
              <button className="btn btn-danger" onClick={() => handleResolve('REJECTED')}>❌ Rejeter</button>
              <button className="btn btn-success" onClick={() => handleResolve('APPROVED')}>✅ Accepter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

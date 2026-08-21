import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';

export default function ArtistsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [earningsModal, setEarningsModal] = useState<any>(null);
  const [earningsData, setEarningsData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getArtists({
        page, limit: 20,
        search: search || undefined,
        isVerified: verifiedFilter === 'yes' ? true : verifiedFilter === 'no' ? false : undefined,
      });
      setData(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, verifiedFilter]);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (id: string, verified: boolean, name: string) => {
    try {
      await api.verifyArtist(id, verified);
      toast.success(verified ? `${name} vérifié ✅` : `Vérification de ${name} retirée`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEarnings = async (artist: any) => {
    setEarningsModal(artist);
    setEarningsData(null);
    try {
      const d = await api.getArtistEarnings(artist.id);
      setEarningsData(d);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar">
          🔍<input placeholder="Chercher un artiste..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={verifiedFilter} onChange={e => { setVerifiedFilter(e.target.value); setPage(1); }}>
          <option value="">Tous</option>
          <option value="yes">Vérifiés ✅</option>
          <option value="no">Non vérifiés</option>
        </select>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Artistes ({data?.total ?? '…'})</span>
        </div>

        {loading ? <div className="loading"><div className="spinner" /> Chargement...</div> : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Artiste</th>
                  <th>Followers</th>
                  <th>Pistes</th>
                  <th>Revenus total</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.artists.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{a.stageName[0]}</div>
                        <div>
                          <div className="user-name">{a.stageName}</div>
                          <div className="user-email">{a.user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{(a.totalFollowers || 0).toLocaleString()}</span></td>
                    <td>{a._count?.tracks || 0}</td>
                    <td style={{ fontWeight: 600 }}>{(a.totalEarnings || 0).toLocaleString()} FCFA</td>
                    <td>
                      {a.isVerified
                        ? <span className="badge badge-green">✅ Vérifié</span>
                        : <span className="badge badge-gray">Non vérifié</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEarnings(a)}>💰 Revenus</button>
                        {a.isVerified ? (
                          <button className="btn btn-danger btn-sm" onClick={() => handleVerify(a.id, false, a.stageName)}>Retirer ✅</button>
                        ) : (
                          <button className="btn btn-success btn-sm" onClick={() => handleVerify(a.id, true, a.stageName)}>Vérifier</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">{data.total} artistes • Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Préc.</button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Suiv. →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Earnings Modal */}
      {earningsModal && (
        <div className="modal-backdrop" onClick={() => setEarningsModal(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">💰 Revenus de {earningsModal.stageName}</div>
            {!earningsData ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <>
                <div className="stats-grid" style={{ marginBottom: 16 }}>
                  <div className="stat-card green">
                    <div style={{ fontWeight: 700, fontSize: 28 }}>{earningsData.profile.totalEarnings.toLocaleString()}</div>
                    <div className="stat-label">Revenus total (FCFA)</div>
                  </div>
                  <div className="stat-card orange">
                    <div className="stat-value">{earningsData.profile.pendingPayout.toLocaleString()}</div>
                    <div className="stat-label">En attente (FCFA)</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Derniers retraits ({earningsData.withdrawals.length})
                </div>
                {earningsData.withdrawals.slice(0, 5).map((w: any) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{new Date(w.createdAt).toLocaleDateString('fr-FR')}</span>
                    <span style={{ fontWeight: 600 }}>{w.amount.toLocaleString()} FCFA</span>
                    <span className={`badge badge-${w.status === 'COMPLETED' ? 'green' : w.status === 'PENDING' ? 'yellow' : 'red'}`}>{w.status}</span>
                  </div>
                ))}
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEarningsModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

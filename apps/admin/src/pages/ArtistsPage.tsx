import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';
import {
  SearchIcon, CheckCircleIcon, XCircleIcon, WalletIcon, PrevIcon, NextIcon,
  ArtistsIcon, BarChartIcon, XIcon,
} from '../icons';

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
      toast.success(verified ? `${name} vérifié` : `Vérification de ${name} retirée`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEarnings = async (artist: any) => {
    setEarningsModal(artist); setEarningsData(null);
    try { setEarningsData(await api.getArtistEarnings(artist.id)); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="search-bar">
          <SearchIcon size={14} color="var(--text-muted)" />
          <input placeholder="Chercher un artiste..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={verifiedFilter} onChange={e => { setVerifiedFilter(e.target.value); setPage(1); }}>
          <option value="">Tous</option>
          <option value="yes">Vérifiés</option>
          <option value="no">Non vérifiés</option>
        </select>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArtistsIcon size={14} /> Artistes ({data?.total ?? '…'})
          </span>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <>
            <table>
              <thead><tr><th>Artiste</th><th>Followers</th><th>Pistes</th><th>Revenus</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {data?.artists.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{a.stageName[0]}</div>
                        <div><div className="user-name">{a.stageName}</div><div className="user-email">{a.user?.email}</div></div>
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{(a.totalFollowers || 0).toLocaleString()}</span></td>
                    <td>{a._count?.tracks || 0}</td>
                    <td style={{ fontWeight: 600 }}>{(a.totalEarnings || 0).toLocaleString()} FCFA</td>
                    <td>
                      {a.isVerified
                        ? <span className="badge badge-green"><CheckCircleIcon size={10} /> Vérifié</span>
                        : <span className="badge badge-gray">Non vérifié</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEarnings(a)}>
                          <BarChartIcon size={14} /> Revenus
                        </button>
                        {a.isVerified ? (
                          <button className="btn btn-danger btn-sm" onClick={() => handleVerify(a.id, false, a.stageName)}>
                            <XCircleIcon size={14} /> Retirer
                          </button>
                        ) : (
                          <button className="btn btn-success btn-sm" onClick={() => handleVerify(a.id, true, a.stageName)}>
                            <CheckCircleIcon size={14} /> Vérifier
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">{data.total} artistes • Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><PrevIcon size={14} /></button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}><NextIcon size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {earningsModal && (
        <div className="modal-backdrop" onClick={() => setEarningsModal(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title"><BarChartIcon size={16} /> Revenus — {earningsModal.stageName}</div>
            {!earningsData ? <div className="loading"><div className="spinner" /></div> : (
              <>
                <div className="stats-grid" style={{ marginBottom: 16 }}>
                  <div className="stat-card green">
                    <div className="stat-icon"><WalletIcon size={18} /></div>
                    <div className="stat-value">{earningsData.profile.totalEarnings.toLocaleString()}</div>
                    <div className="stat-label">Revenus total (FCFA)</div>
                  </div>
                  <div className="stat-card orange">
                    <div className="stat-icon"><WalletIcon size={18} /></div>
                    <div className="stat-value">{earningsData.profile.pendingPayout.toLocaleString()}</div>
                    <div className="stat-label">En attente (FCFA)</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Derniers retraits</div>
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
              <button className="btn btn-ghost" onClick={() => setEarningsModal(null)}><XIcon size={14} /> Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

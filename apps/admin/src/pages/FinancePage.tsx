import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';
import {
  BanknoteIcon, ReceiptIcon, StarIcon, BarChartIcon,
  CheckCircleIcon, XCircleIcon, PrevIcon, NextIcon, FinanceIcon,
} from '../icons';

export default function FinancePage() {
  const [tab, setTab] = useState<'withdrawals' | 'purchases' | 'subscriptions' | 'revenue'>('withdrawals');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [revenueData, setRevenueData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'withdrawals') setData(await api.getWithdrawals({ page, limit: 20, status: statusFilter || undefined }));
      else if (tab === 'purchases') setData(await api.getPurchases({ page, limit: 20 }));
      else if (tab === 'subscriptions') setData(await api.getSubscriptions({ page, limit: 20, status: statusFilter || undefined }));
      else if (tab === 'revenue') { setRevenueData(await api.getRevenueStats()); setData(null); }
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [tab, page, statusFilter]);

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => { load(); }, [load]);

  const handleWithdrawal = async (id: string, status: 'COMPLETED' | 'FAILED') => {
    try {
      await api.updateWithdrawalStatus(id, status);
      toast.success(status === 'COMPLETED' ? 'Retrait approuvé' : 'Retrait rejeté');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const withdrawalBadge = (s: string) => {
    const map: Record<string, string> = { PENDING: 'badge-yellow', PROCESSING: 'badge-blue', COMPLETED: 'badge-green', FAILED: 'badge-red' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  const tabs = [
    { id: 'withdrawals', label: 'Retraits', Icon: BanknoteIcon },
    { id: 'purchases',   label: 'Achats',   Icon: ReceiptIcon },
    { id: 'subscriptions', label: 'Abonnements', Icon: StarIcon },
    { id: 'revenue',    label: 'Revenus',   Icon: BarChartIcon },
  ] as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? <div className="loading"><div className="spinner" /> Chargement...</div> : (
        <>
          {/* Withdrawals */}
          {tab === 'withdrawals' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="">Tous</option>
                  <option value="PENDING">En attente</option>
                  <option value="PROCESSING">En traitement</option>
                  <option value="COMPLETED">Complétés</option>
                  <option value="FAILED">Échoués</option>
                </select>
              </div>
              <div className="table-container">
                <div className="table-header">
                  <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BanknoteIcon size={14} /> Demandes de retrait ({data?.total ?? '…'})
                  </span>
                </div>
                <table>
                  <thead><tr><th>Artiste</th><th>Montant</th><th>Méthode</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {data?.withdrawals.map((w: any) => (
                      <tr key={w.id}>
                        <td>{w.artist?.stageName}</td>
                        <td style={{ fontWeight: 700, color: 'var(--green)' }}>{w.amount.toLocaleString()} FCFA</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{w.paymentMethod}</td>
                        <td>{withdrawalBadge(w.status)}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(w.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td>
                          {(w.status === 'PENDING' || w.status === 'PROCESSING') && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-success btn-sm" onClick={() => handleWithdrawal(w.id, 'COMPLETED')}>
                                <CheckCircleIcon size={14} /> Approuver
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleWithdrawal(w.id, 'FAILED')}>
                                <XCircleIcon size={14} /> Rejeter
                              </button>
                            </div>
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
                      <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><PrevIcon size={14} /></button>
                      <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}><NextIcon size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Purchases */}
          {tab === 'purchases' && data && (
            <div className="table-container">
              <div className="table-header">
                <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ReceiptIcon size={14} /> Achats ({data.total})
                </span>
              </div>
              <table>
                <thead><tr><th>Utilisateur</th><th>Type</th><th>Montant</th><th>Commission</th><th>Date</th></tr></thead>
                <tbody>
                  {data.purchases.map((p: any) => (
                    <tr key={p.id}>
                      <td><div className="user-name">{p.user?.name}</div><div className="user-email">{p.user?.email}</div></td>
                      <td><span className="badge badge-blue">{p.type}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.amount.toLocaleString()} FCFA</td>
                      <td style={{ color: 'var(--green)', fontWeight: 600 }}>+{(p.platformFeeAmount || 0).toLocaleString()} FCFA</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Subscriptions */}
          {tab === 'subscriptions' && data && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="">Tous</option>
                  <option value="ACTIVE">Actifs</option>
                  <option value="EXPIRED">Expirés</option>
                  <option value="CANCELLED">Annulés</option>
                </select>
              </div>
              <div className="table-container">
                <div className="table-header">
                  <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StarIcon size={14} /> Abonnements ({data.total})
                  </span>
                </div>
                <table>
                  <thead><tr><th>Utilisateur</th><th>Tier</th><th>Statut</th><th>Mis à jour</th></tr></thead>
                  <tbody>
                    {data.subscriptions.map((s: any) => (
                      <tr key={s.id}>
                        <td><div className="user-name">{s.user?.name}</div><div className="user-email">{s.user?.email}</div></td>
                        <td>
                          {s.tier === 'FREE' ? <span className="badge badge-gray">FREE</span>
                            : s.tier === 'PRO' ? <span className="badge badge-purple">PRO</span>
                            : <span className="badge badge-orange">PREMIUM</span>
                          }
                        </td>
                        <td>{s.status === 'ACTIVE' ? <span className="badge badge-green">ACTIF</span> : <span className="badge badge-red">{s.status}</span>}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(s.updatedAt).toLocaleDateString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Revenue */}
          {tab === 'revenue' && revenueData && (
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <BarChartIcon size={15} /> Revenus mensuels — 6 derniers mois
                </div>
                <table>
                  <thead><tr><th>Mois</th><th>Revenus plateforme</th><th>Revenus bruts</th></tr></thead>
                  <tbody>
                    {revenueData.monthly.map((m: any) => (
                      <tr key={m.label}>
                        <td style={{ fontWeight: 500 }}>{m.label}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 700 }}>{m.platformRevenue.toLocaleString()} FCFA</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{m.grossRevenue.toLocaleString()} FCFA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <FinanceIcon size={15} /> Répartition par type de transaction
                </div>
                <table>
                  <thead><tr><th>Type</th><th>Commission plateforme</th></tr></thead>
                  <tbody>
                    {revenueData.byType.map((b: any) => (
                      <tr key={b.type}>
                        <td><span className="badge badge-blue">{b.type}</span></td>
                        <td style={{ fontWeight: 600, color: 'var(--green)' }}>{(b._sum.platformFeeAmount || 0).toLocaleString()} FCFA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

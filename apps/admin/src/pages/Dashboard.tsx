import { useEffect, useState } from 'react';
import { api } from '../api';

function StatCard({ icon, value, label, sub, color = 'purple' }: {
  icon: string; value: string | number; label: string; sub?: string; color?: string;
}) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-change up">↑ {sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [topContent, setTopContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getTopContent()])
      .then(([s, t]) => { setStats(s); setTopContent(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /> Chargement...</div>;
  if (!stats) return <div className="empty-state"><div className="empty-icon">❌</div><p>Impossible de charger les statistiques</p></div>;

  return (
    <div>
      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard icon="👥" value={stats.users.total} label="Utilisateurs" sub={`+${stats.users.newThisMonth} ce mois`} color="purple" />
        <StatCard icon="🎤" value={stats.artists.total} label="Artistes actifs" color="orange" />
        <StatCard icon="🎵" value={stats.content.tracks} label="Pistes" color="blue" />
        <StatCard icon="🎬" value={stats.content.videos} label="Vidéos" color="green" />
        <StatCard icon="💰" value={`${stats.finance.revenueThisMonthFcfa.toLocaleString()} FCFA`} label="Revenus ce mois" sub={`${stats.finance.revenueGrowthPct > 0 ? '+' : ''}${stats.finance.revenueGrowthPct}%`} color="green" />
        <StatCard icon="⭐" value={stats.finance.activeSubscriptions} label="Abonnés premium" color="yellow" />
        <StatCard icon="⏳" value={stats.artists.pendingWithdrawals} label="Retraits en attente" color="red" />
        <StatCard icon="🛡️" value={stats.moderation.pendingCopyrightReports} label="Rapports copyright" color="red" />
      </div>

      {/* Top Content */}
      {topContent && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          {/* Top Tracks */}
          <div className="table-container">
            <div className="table-header">
              <span className="table-title">🎵 Top Pistes</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Titre</th>
                  <th>Écoutes</th>
                </tr>
              </thead>
              <tbody>
                {topContent.topTracks.slice(0, 5).map((t: any, i: number) => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--text-muted)', width: 30 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.artist?.stageName}</div>
                    </td>
                    <td><span className="badge badge-blue">{(t.plays || 0).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Artists */}
          <div className="table-container">
            <div className="table-header">
              <span className="table-title">🎤 Top Artistes</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Artiste</th>
                  <th>Followers</th>
                </tr>
              </thead>
              <tbody>
                {topContent.topArtists.slice(0, 5).map((a: any, i: number) => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--text-muted)', width: 30 }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{a.stageName}</span>
                        {a.isVerified && <span title="Vérifié">✅</span>}
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{(a.totalFollowers || 0).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Videos */}
          <div className="table-container">
            <div className="table-header">
              <span className="table-title">🎬 Top Vidéos</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Titre</th>
                  <th>Vues</th>
                </tr>
              </thead>
              <tbody>
                {topContent.topVideos.slice(0, 5).map((v: any, i: number) => (
                  <tr key={v.id}>
                    <td style={{ color: 'var(--text-muted)', width: 30 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{v.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.artist?.stageName}</div>
                    </td>
                    <td><span className="badge badge-green">{(v.views || 0).toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from '../App';

export default function SystemPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [cachePattern, setCachePattern] = useState('feed:*');

  const loadHealth = async () => {
    setLoading(true);
    try { setHealth(await api.getSystemHealth()); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadHealth(); }, []);

  const handleFlushCache = async () => {
    if (!confirm(`Vider le cache "${cachePattern}" ?`)) return;
    setFlushing(true);
    try {
      const res = await api.flushCache(cachePattern || undefined);
      toast.success(`Cache vidé — ${res.flushed} clés supprimées (pattern: ${res.pattern})`);
    } catch (e: any) { toast.error(e.message); }
    finally { setFlushing(false); }
  };

  const statusIndicator = (status: string) => {
    const ok = status === 'healthy';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: ok ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 13,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: ok ? 'var(--green)' : 'var(--red)',
          boxShadow: ok ? '0 0 8px var(--green)' : '0 0 8px var(--red)',
          animation: ok ? 'pulse 2s infinite' : 'none',
        }} />
        {ok ? 'Opérationnel' : 'Erreur'}
      </span>
    );
  };

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Health Check */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">État des services</div>
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : health ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 500 }}>🗄️ Base de données (PostgreSQL)</span>
                {statusIndicator(health.database?.status)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <span style={{ fontWeight: 500 }}>⚡ Redis (Cache)</span>
                {statusIndicator(health.redis?.status)}
              </div>
            </div>
          ) : null}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={loadHealth}>
            🔄 Rafraîchir
          </button>
        </div>

        <div className="card">
          <div className="card-title">Serveur</div>
          {health && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Environnement', value: health.environment || '—' },
                { label: 'Node.js', value: health.nodeVersion || '—' },
                { label: 'Mémoire RSS', value: `${health.memoryMB || 0} MB` },
                { label: 'Uptime', value: `${Math.floor((health.uptime || 0) / 3600)}h ${Math.floor(((health.uptime || 0) % 3600) / 60)}m` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cache Management */}
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Gestion du cache Redis</div>
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          ⚠️ Vider le cache peut temporairement ralentir l'application jusqu'à ce que les données soient recalculées.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select value={cachePattern} onChange={e => setCachePattern(e.target.value)} style={{ flex: 1 }}>
            <option value="feed:*">Feed (feed:*)</option>
            <option value="tracks:*">Pistes (tracks:*)</option>
            <option value="artists:*">Artistes (artists:*)</option>
            <option value="admin:*">Admin (admin:*)</option>
          </select>
          <button
            className="btn btn-danger"
            onClick={handleFlushCache}
            disabled={flushing}
          >
            {flushing ? '⏳ En cours...' : '🗑️ Vider'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Pattern sélectionné : <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>{cachePattern}</code>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from '../App';
import {
  DatabaseIcon, ServerIcon, CpuIcon, ActivityIcon,
  CheckCircleIcon, XCircleIcon, RefreshIcon, DeleteIcon, HardDriveIcon,
  WarningIcon, WifiIcon, WifiOffIcon,
} from '../icons';

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
      toast.success(`Cache vidé — ${res.flushed} clés supprimées`);
    } catch (e: any) { toast.error(e.message); }
    finally { setFlushing(false); }
  };

  const ServiceRow = ({ Icon, label, status }: { Icon: React.ElementType; label: string; status: string }) => {
    const ok = status === 'healthy';
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={16} color="var(--text-secondary)" />
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: ok ? 'var(--green)' : 'var(--red)',
            boxShadow: ok ? '0 0 8px var(--green)' : '0 0 8px var(--red)',
            animation: ok ? 'servicePulse 2s infinite' : 'none',
          }} />
          <span style={{ color: ok ? 'var(--green)' : 'var(--red)', fontWeight: 600, fontSize: 13 }}>
            {ok ? 'Opérationnel' : 'Erreur'}
          </span>
          {ok ? <WifiIcon size={13} color="var(--green)" /> : <WifiOffIcon size={13} color="var(--red)" />}
        </div>
      </div>
    );
  };

  return (
    <div>
      <style>{`
        @keyframes servicePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <ActivityIcon size={15} /> État des services
          </div>
          {loading ? <div className="loading"><div className="spinner" /></div> : health ? (
            <div>
              <ServiceRow Icon={DatabaseIcon} label="Base de données (PostgreSQL)" status={health.database?.status} />
              <ServiceRow Icon={ServerIcon}   label="Redis (Cache)"                status={health.redis?.status} />
            </div>
          ) : null}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={loadHealth}>
            <RefreshIcon size={14} /> Rafraîchir
          </button>
        </div>

        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CpuIcon size={15} /> Métriques serveur
          </div>
          {health && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { Icon: ServerIcon,    label: 'Environnement', value: health.environment || '—' },
                { Icon: CpuIcon,       label: 'Node.js',       value: health.nodeVersion || '—' },
                { Icon: HardDriveIcon, label: 'Mémoire RSS',   value: `${health.memoryMB || 0} MB` },
                { Icon: ActivityIcon,  label: 'Uptime',        value: `${Math.floor((health.uptime || 0) / 3600)}h ${Math.floor(((health.uptime || 0) % 3600) / 60)}m` },
              ].map(({ Icon, label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                    <Icon size={14} />
                    {label}
                  </div>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cache Management */}
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <HardDriveIcon size={15} /> Gestion du cache Redis
        </div>
        <div className="alert alert-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <WarningIcon size={14} /> Vider le cache peut temporairement ralentir l'application.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select value={cachePattern} onChange={e => setCachePattern(e.target.value)} style={{ flex: 1 }}>
            <option value="feed:*">Feed (feed:*)</option>
            <option value="tracks:*">Pistes (tracks:*)</option>
            <option value="artists:*">Artistes (artists:*)</option>
            <option value="admin:*">Admin (admin:*)</option>
          </select>
          <button className="btn btn-danger" onClick={handleFlushCache} disabled={flushing}>
            <DeleteIcon size={14} /> {flushing ? 'En cours...' : 'Vider'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Pattern : <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>{cachePattern}</code>
        </div>
      </div>
    </div>
  );
}

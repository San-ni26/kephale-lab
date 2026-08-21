import { useState } from 'react';
import { api } from '../api';
import { toast } from '../App';
import { BroadcastIcon, UsersIcon, ArtistsIcon, StarIcon, SendIcon, BellIcon, WarningIcon, CheckCircleIcon } from '../icons';

const SEGMENTS = [
  { value: 'all',     label: 'Tous les utilisateurs',  Icon: UsersIcon,    desc: 'Notifie 100% des utilisateurs actifs' },
  { value: 'artists', label: 'Artistes uniquement',    Icon: ArtistsIcon,  desc: 'Notifie uniquement les comptes artistes' },
  { value: 'premium', label: 'Abonnés premium',        Icon: StarIcon,     desc: 'Notifie les utilisateurs avec un abonnement payant actif' },
];

export default function BroadcastPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Titre et message requis'); return; }
    if (!confirm(`Envoyer "${title}" à ${segment === 'all' ? 'TOUS les utilisateurs' : segment} ?`)) return;
    setLoading(true); setResult(null);
    try {
      const res = await api.broadcast(title, body, segment);
      setResult(res);
      toast.success(`Notification envoyée à ${res.sent} utilisateurs !`);
      setTitle(''); setBody('');
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const selectedSeg = SEGMENTS.find(s => s.value === segment);

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <BroadcastIcon size={16} /> Envoyer une notification groupée
        </div>

        <div className="alert alert-warning" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <WarningIcon size={14} /> Limité à 5 broadcasts par heure. Utilisez avec précaution.
        </div>

        {/* Segment Selection */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {SEGMENTS.map(({ value, label, Icon, desc }) => (
            <div
              key={value}
              onClick={() => setSegment(value)}
              style={{
                flex: 1, padding: 14, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${segment === value ? 'var(--accent)' : 'var(--border)'}`,
                background: segment === value ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                <Icon size={14} color={segment === value ? 'var(--accent)' : 'var(--text-secondary)'} />
                {label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Titre de la notification</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Nouvelle fonctionnalité disponible !" maxLength={100} style={{ width: '100%' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{title.length}/100 caractères</div>
        </div>

        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Rédigez votre message..." maxLength={500} rows={4} style={{ width: '100%', resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{body.length}/500 caractères</div>
        </div>

        {/* Preview */}
        {(title || body) && (
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Aperçu de la notification</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <BellIcon size={22} color="var(--accent)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title || 'Titre...'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{body || 'Message...'}</div>
              </div>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: 12, gap: 8 }}
          disabled={loading || !title || !body}
          onClick={handleSend}
        >
          {loading ? 'Envoi en cours...' : <><SendIcon size={14} /> Envoyer à {selectedSeg?.label}</>}
        </button>
      </div>

      {result && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircleIcon size={16} />
          Notification envoyée à <strong>{result.sent.toLocaleString()}</strong> utilisateurs (segment : {result.segment})
        </div>
      )}
    </div>
  );
}

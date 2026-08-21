import { useState } from 'react';
import { api } from '../api';
import { toast } from '../App';

const SEGMENTS = [
  { value: 'all', label: '👥 Tous les utilisateurs', desc: 'Notifie 100% des utilisateurs actifs' },
  { value: 'artists', label: '🎤 Artistes uniquement', desc: 'Notifie uniquement les comptes artistes' },
  { value: 'premium', label: '⭐ Abonnés premium', desc: 'Notifie les utilisateurs avec un abonnement payant actif' },
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

    setLoading(true);
    setResult(null);
    try {
      const res = await api.broadcast(title, body, segment);
      setResult(res);
      toast.success(`✅ Notification envoyée à ${res.sent} utilisateurs !`);
      setTitle('');
      setBody('');
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const selectedSeg = SEGMENTS.find(s => s.value === segment);

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Envoyer une notification groupée</div>

        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          ⚠️ Cette action envoie une notification push à tous les utilisateurs sélectionnés. Utilisez avec précaution — limité à 5 broadcasts par heure.
        </div>

        {/* Segment Selection */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {SEGMENTS.map(s => (
            <div
              key={s.value}
              onClick={() => setSegment(s.value)}
              style={{
                flex: 1, padding: 14, borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${segment === s.value ? 'var(--accent)' : 'var(--border)'}`,
                background: segment === s.value ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Titre de la notification</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Nouvelle fonctionnalité disponible !"
            maxLength={100}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{title.length}/100 caractères</div>
        </div>

        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Rédigez votre message..."
            maxLength={500}
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{body.length}/500 caractères</div>
        </div>

        {/* Preview */}
        {(title || body) && (
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Aperçu de la notification</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24 }}>⚡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{title || 'Titre...'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{body || 'Message...'}</div>
              </div>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: 12 }}
          disabled={loading || !title || !body}
          onClick={handleSend}
        >
          {loading ? '⏳ Envoi en cours...' : `📣 Envoyer à ${selectedSeg?.label}`}
        </button>
      </div>

      {result && (
        <div className="alert alert-success">
          ✅ Notification envoyée avec succès à <strong>{result.sent.toLocaleString()}</strong> utilisateurs (segment : {result.segment})
        </div>
      )}
    </div>
  );
}

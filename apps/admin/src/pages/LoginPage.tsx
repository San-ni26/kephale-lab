import { useState } from 'react';
import { api } from '../api';
import { toast } from '../App';
import { ZapIcon, LockIcon, CheckCircleIcon, EyeIcon, EyeOffIcon } from '../icons';

export default function LoginPage({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, password);
      onLogin(data.accessToken, data.user);
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
            <ZapIcon size={28} color="var(--orange)" />
            <h1 style={{ margin: 0, fontSize: 28 }}>Kephale</h1>
          </div>
          <p>Tableau de bord administrateur</p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockIcon size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Adresse email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@kephale.com" required autoFocus />
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Mot de passe</label>
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ paddingRight: 40 }} />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              style={{ position: 'absolute', right: 12, top: 34, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              {showPass ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px', gap: 8 }}>
            {loading ? 'Connexion...' : <><CheckCircleIcon size={16} /> Accéder au tableau de bord</>}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          <LockIcon size={11} style={{ verticalAlign: 'middle' }} /> Accès réservé aux administrateurs Kephale
        </p>
      </div>
    </div>
  );
}

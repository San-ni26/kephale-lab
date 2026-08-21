import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { toast } from '../App';
import {
  SearchIcon, BellIcon, ShieldIcon, UnlockIcon, DeleteIcon,
  CheckCircleIcon, XCircleIcon, UsersIcon, PrevIcon, NextIcon, XIcon,
} from '../icons';

type User = {
  id: string; name: string; email: string; username: string;
  avatar: string | null; role: string; isActive: boolean; createdAt: string;
  artistProfile: any; subscription: any;
};

export default function UsersPage() {
  const [data, setData] = useState<{ users: User[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showBanned, setShowBanned] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ type: string; user: User } | null>(null);
  const [notifyModal, setNotifyModal] = useState<User | null>(null);
  const [notifyForm, setNotifyForm] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUsers({ page, limit: 20, search: search || undefined, role: role || undefined, isBanned: showBanned ? true : undefined });
      setData(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, role, showBanned]);

  useEffect(() => { load(); }, [load]);

  const handleBan = async (user: User, ban: boolean) => {
    try {
      await api.banUser(user.id, ban);
      toast.success(ban ? `${user.name} suspendu` : `${user.name} réactivé`);
      setConfirmModal(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    try {
      await api.changeUserRole(user.id, newRole);
      toast.success(`Rôle de ${user.name} → ${newRole}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (user: User) => {
    try {
      await api.deleteUser(user.id);
      toast.success(`Compte de ${user.name} supprimé`);
      setConfirmModal(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleNotify = async () => {
    if (!notifyModal) return;
    try {
      await api.notifyUser(notifyModal.id, notifyForm.title, notifyForm.body);
      toast.success('Notification envoyée !');
      setNotifyModal(null); setNotifyForm({ title: '', body: '' });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar">
          <SearchIcon size={14} color="var(--text-muted)" />
          <input placeholder="Rechercher un utilisateur..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">Tous les rôles</option>
          <option value="LISTENER">Listener</option>
          <option value="ARTIST">Artiste</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className={`btn ${showBanned ? 'btn-danger' : 'btn-ghost'} btn-sm`} onClick={() => { setShowBanned(!showBanned); setPage(1); }}>
          <ShieldIcon size={14} /> {showBanned ? 'Comptes suspendus' : 'Tous'}
        </button>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UsersIcon size={14} /> Utilisateurs ({data?.total ?? '…'})
          </span>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div> : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th><th>Rôle</th><th>Abonnement</th><th>Statut</th><th>Inscription</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          {user.avatar ? <img src={user.avatar} alt="" /> : user.name[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="user-name">{user.name}</div>
                          <div className="user-email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select value={user.role} onChange={e => handleRoleChange(user, e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                        <option value="LISTENER">LISTENER</option>
                        <option value="ARTIST">ARTIST</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td>
                      {user.subscription?.tier === 'FREE'
                        ? <span className="badge badge-gray">FREE</span>
                        : <span className="badge badge-green">{user.subscription?.tier}</span>
                      }
                    </td>
                    <td>
                      {user.isActive
                        ? <span className="badge badge-green"><CheckCircleIcon size={10} /> Actif</span>
                        : <span className="badge badge-red"><XCircleIcon size={10} /> Suspendu</span>
                      }
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(user.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Notification" onClick={() => { setNotifyModal(user); setNotifyForm({ title: '', body: '' }); }}>
                          <BellIcon size={14} />
                        </button>
                        {user.isActive ? (
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmModal({ type: 'ban', user })}>
                            <ShieldIcon size={14} /> Suspendre
                          </button>
                        ) : (
                          <button className="btn btn-success btn-sm" onClick={() => handleBan(user, false)}>
                            <UnlockIcon size={14} /> Réactiver
                          </button>
                        )}
                        <button className="btn btn-danger btn-sm btn-icon" title="Supprimer" onClick={() => setConfirmModal({ type: 'delete', user })} disabled={user.role === 'ADMIN'}>
                          <DeleteIcon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data && data.totalPages > 1 && (
              <div className="pagination">
                <span className="pagination-info">{data.total} utilisateurs • Page {page}/{data.totalPages}</span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><PrevIcon size={14} /></button>
                  <button className="btn btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}><NextIcon size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {confirmModal && (
        <div className="modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {confirmModal.type === 'ban' ? <><ShieldIcon size={16} /> Suspendre l'utilisateur</> : <><DeleteIcon size={16} /> Supprimer le compte</>}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {confirmModal.type === 'ban'
                ? `Suspendre ${confirmModal.user.name} ? Les tokens actifs seront révoqués.`
                : `Supprimer définitivement ${confirmModal.user.name} ? Action irréversible.`
              }
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}><XIcon size={14} /> Annuler</button>
              <button className="btn btn-danger" onClick={() => confirmModal.type === 'ban' ? handleBan(confirmModal.user, true) : handleDelete(confirmModal.user)}>
                {confirmModal.type === 'ban' ? 'Suspendre' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notifyModal && (
        <div className="modal-backdrop" onClick={() => setNotifyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title"><BellIcon size={16} /> Notifier {notifyModal.name}</div>
            <div className="form-group">
              <label className="form-label">Titre</label>
              <input value={notifyForm.title} onChange={e => setNotifyForm(p => ({ ...p, title: e.target.value }))} placeholder="Titre de la notification" style={{ width: '100%' }} />
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Message</label>
              <textarea value={notifyForm.body} onChange={e => setNotifyForm(p => ({ ...p, body: e.target.value }))} placeholder="Contenu du message..." rows={3} style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setNotifyModal(null)}><XIcon size={14} /> Annuler</button>
              <button className="btn btn-primary" onClick={handleNotify} disabled={!notifyForm.title || !notifyForm.body}><CheckCircleIcon size={14} /> Envoyer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

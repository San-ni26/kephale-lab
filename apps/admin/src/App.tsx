import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import ContentPage from './pages/ContentPage';
import ArtistsPage from './pages/ArtistsPage';
import FinancePage from './pages/FinancePage';
import ModerationPage from './pages/ModerationPage';
import BroadcastPage from './pages/BroadcastPage';
import SystemPage from './pages/SystemPage';
import AdsPage from './pages/AdsPage';

import {
  DashboardIcon, UsersIcon, ArtistsIcon, ContentIcon, FinanceIcon,
  ModerationIcon, BroadcastIcon, SystemIcon, AdsIcon,
  RefreshIcon, LogoutIcon, ZapIcon,
} from './icons';

// ── Toast system ──────────────────────────────────────────────────────────────
type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string };
let _toastId = 0;
let _setToasts: React.Dispatch<React.SetStateAction<Toast[]>> | null = null;

export const toast = {
  success: (msg: string) => _setToasts?.(p => [...p, { id: ++_toastId, type: 'success', message: msg }]),
  error: (msg: string) => _setToasts?.(p => [...p, { id: ++_toastId, type: 'error', message: msg }]),
  info: (msg: string) => _setToasts?.(p => [...p, { id: ++_toastId, type: 'info', message: msg }]),
};

// ── Nav Items ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Tableau de bord', Icon: DashboardIcon, section: 'Vue d\'ensemble' },
  { id: 'users',     label: 'Utilisateurs',     Icon: UsersIcon,    section: 'Gestion' },
  { id: 'artists',   label: 'Artistes',          Icon: ArtistsIcon,  section: 'Gestion' },
  { id: 'content',   label: 'Contenu',           Icon: ContentIcon,  section: 'Gestion' },
  { id: 'finance',   label: 'Finances',          Icon: FinanceIcon,  section: 'Business' },
  { id: 'ads',       label: 'Studio Pub',        Icon: AdsIcon,      section: 'Business' },
  { id: 'moderation',label: 'Modération',        Icon: ModerationIcon,section: 'Business' },
  { id: 'broadcast', label: 'Notifications',     Icon: BroadcastIcon,section: 'Business' },
  { id: 'system',    label: 'Système',           Icon: SystemIcon,   section: 'Admin' },
];

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard:  { title: 'Tableau de bord',  subtitle: 'Vue d\'ensemble de la plateforme' },
  users:      { title: 'Utilisateurs',     subtitle: 'Gestion des comptes' },
  artists:    { title: 'Artistes',         subtitle: 'Profils et vérifications' },
  content:    { title: 'Contenu',          subtitle: 'Modération des pistes et vidéos' },
  finance:    { title: 'Finances',         subtitle: 'Retraits, achats et abonnements' },
  ads:        { title: 'Studio Publicitaire', subtitle: 'Annonceurs, campagnes et performances' },
  moderation: { title: 'Modération',       subtitle: 'Rapports de copyright' },
  broadcast:  { title: 'Notifications',    subtitle: 'Envoi de messages groupés' },
  system:     { title: 'Système',          subtitle: 'Santé et configuration' },
};

function groupBy<T>(arr: T[], key: (item: T) => string) {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken'));
  const [user, setUser] = useState<any>(null);
  const [page, setPage] = useState('dashboard');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [badges, setBadges] = useState<Record<string, number>>({});

  _setToasts = setToasts;

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts(p => p.slice(1)), 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  const loadBadges = useCallback(async () => {
    if (!token) return;
    try {
      const stats = await api.getStats();
      setBadges({
        moderation: stats.moderation?.pendingCopyrightReports || 0,
        finance: stats.artists?.pendingWithdrawals || 0,
      });
    } catch {}
  }, [token]);

  useEffect(() => { loadBadges(); }, [loadBadges]);

  const handleLogin = (accessToken: string, userData: any) => {
    if (userData.role !== 'ADMIN') {
      toast.error('Accès refusé — compte admin requis');
      return;
    }
    localStorage.setItem('adminToken', accessToken);
    setToken(accessToken);
    setUser(userData);
    toast.success(`Bienvenue, ${userData.name} !`);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
    setUser(null);
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  const grouped = groupBy(NAV, n => n.section);
  const pageInfo = PAGE_TITLES[page] || PAGE_TITLES.dashboard;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard />;
      case 'users':      return <UsersPage />;
      case 'artists':    return <ArtistsPage />;
      case 'content':    return <ContentPage />;
      case 'finance':    return <FinancePage />;
      case 'ads':        return <AdsPage />;
      case 'moderation': return <ModerationPage />;
      case 'broadcast':  return <BroadcastPage />;
      case 'system':     return <SystemPage />;
      default:           return <Dashboard />;
    }
  };

  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  const toastIcon = (type: string) => {
    if (type === 'success') return <CheckIcon size={14} />;
    if (type === 'error')   return <XIcon size={14} />;
    return <InfoIcon size={14} />;
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ZapIcon size={20} color="var(--orange)" />
            <h1>Kephale</h1>
          </div>
          <span>Administration</span>
        </div>

        <nav className="sidebar-nav">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
              {items.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? 'active' : ''}`}
                  onClick={() => setPage(id)}
                >
                  <span className="nav-icon"><Icon size={16} /></span>
                  {label}
                  {badges[id] > 0 && (
                    <span className="nav-badge">{badges[id]}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-badge">
            <div className="admin-avatar">{initials}</div>
            <div className="admin-info">
              <div className="admin-name">{user?.name || 'Admin'}</div>
              <div className="admin-role">ADMIN</div>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={handleLogout} title="Se déconnecter">
              <LogoutIcon size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="header">
          <div>
            <div className="header-title">{pageInfo.title}</div>
            <div className="header-subtitle">{pageInfo.subtitle}</div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { loadBadges(); toast.info('Données actualisées'); }}
            >
              <RefreshIcon size={14} /> Actualiser
            </button>
          </div>
        </header>

        <div className="page-content">
          {renderPage()}
        </div>
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {toastIcon(t.type)} {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// local icon imports for toast
import { CheckIcon, XIcon, InfoIcon } from './icons';

import { useEffect, useState, useCallback } from 'react';
import { adsApi } from '../adsApi';
import { toast } from '../App';
import {
  BriefcaseIcon, PlusIcon, EditIcon, DeleteIcon, SearchIcon,
  TargetIcon, ClickIcon, ActivityIcon, EyeIcon, PlayIcon, PauseIcon,
  CalendarIcon, GlobeIcon, BarChartIcon, FilterIcon, XIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, FlagIcon, AudienceIcon,
  RefreshIcon, MegaphoneIcon, PlacementIcon,
} from '../icons';

// ── Types ────────────────────────────────────────────────────────────────────
type Advertiser = { id: string; name: string; company?: string; contactEmail?: string; contactPhone?: string; notes?: string; createdAt: string; campaigns?: any[] };
type Campaign = { id: string; title: string; status: string; placement: string; currentImpressions: number; currentClicks: number; maxImpressions?: number; startDate: string; endDate: string; advertiser?: Advertiser; costTokens?: number; targetUrl: string; mediaUrl: string };

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'badge-green', DRAFT: 'badge-gray', PAUSED: 'badge-yellow', COMPLETED: 'badge-blue',
};
const PLACEMENT_LABELS: Record<string, string> = {
  REEL: 'Reel', CLIP_PREROLL: 'Pré-roll', BANNER: 'Bannière', AUDIO_SPOT: 'Spot audio',
  TRACK_BOOST: 'Boost piste', ALBUM_BOOST: 'Boost album',
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_COLORS[status] || 'badge-gray'}`}>{status}</span>;
}

function ctr(impressions: number, clicks: number) {
  if (!impressions) return '0.00%';
  return ((clicks / impressions) * 100).toFixed(2) + '%';
}

// ── Global Stats bar ─────────────────────────────────────────────────────────
function GlobalStats({ stats }: { stats: any }) {
  if (!stats) return null;
  const items = [
    { Icon: BriefcaseIcon, label: 'Annonceurs',  value: stats.totalAdvertisers ?? 0,  color: 'var(--accent)' },
    { Icon: MegaphoneIcon, label: 'Campagnes',   value: stats.totalCampaigns ?? 0,    color: 'var(--orange)' },
    { Icon: ActivityIcon,  label: 'Actives',     value: stats.activeCampaigns ?? 0,   color: 'var(--green)' },
    { Icon: EyeIcon,       label: 'Impressions', value: (stats.totalImpressions ?? 0).toLocaleString(), color: 'var(--blue)' },
    { Icon: ClickIcon,     label: 'Clics',       value: (stats.totalClicks ?? 0).toLocaleString(),       color: 'var(--yellow)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
      {items.map(({ Icon, label, value, color }) => (
        <div key={label} className="card" style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={color} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Advertiser Modal ──────────────────────────────────────────────────────────
function AdvertiserModal({ advertiser, onSave, onClose }: { advertiser?: Advertiser; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: advertiser?.name || '', company: advertiser?.company || '', contactEmail: advertiser?.contactEmail || '', contactPhone: advertiser?.contactPhone || '', notes: advertiser?.notes || '' });
  const [saving, setSaving] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BriefcaseIcon size={18} /> {advertiser ? 'Modifier l\'annonceur' : 'Nouvel annonceur'}
        </div>
        <form onSubmit={handle}>
          {[
            { key: 'name', label: 'Nom *', placeholder: 'Nom de l\'annonceur', required: true },
            { key: 'company', label: 'Entreprise', placeholder: 'Nom de la société' },
            { key: 'contactEmail', label: 'Email de contact', placeholder: 'contact@entreprise.com', type: 'email' },
            { key: 'contactPhone', label: 'Téléphone', placeholder: '+224 ...' },
          ].map(({ key, label, placeholder, required, type }) => (
            <div className="form-group" key={key} style={{ marginBottom: 12 }}>
              <label className="form-label">{label}</label>
              <input type={type || 'text'} value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} required={required} style={{ width: '100%' }} />
            </div>
          ))}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes internes..." rows={2} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}><XIcon size={14} /> Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.name}>
              {saving ? 'Sauvegarde...' : <><CheckCircleIcon size={14} /> Sauvegarder</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Modal ────────────────────────────────────────────────────────────
function CampaignModal({ campaign, advertisers, onSave, onClose }: { campaign?: Campaign; advertisers: Advertiser[]; onSave: (data: any) => void; onClose: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    advertiserId: campaign?.advertiser?.id || (advertisers[0]?.id || ''),
    title: campaign?.title || '',
    placement: campaign?.placement || 'REEL',
    mediaUrl: campaign?.mediaUrl || '',
    targetUrl: campaign?.targetUrl || '',
    ctaText: 'En savoir plus',
    startDate: campaign?.startDate?.split('T')[0] || today,
    endDate: campaign?.endDate?.split('T')[0] || '',
    maxImpressions: campaign?.maxImpressions || '',
    status: campaign?.status || 'DRAFT',
    targetCountries: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, maxImpressions: form.maxImpressions ? Number(form.maxImpressions) : undefined }); }
    finally { setSaving(false); }
  };

  const field = (key: string, label: string, opts: any = {}) => (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label className="form-label">{label}</label>
      <input
        {...opts}
        value={(form as any)[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        style={{ width: '100%' }}
      />
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MegaphoneIcon size={18} /> {campaign ? 'Modifier la campagne' : 'Nouvelle campagne'}
        </div>
        <form onSubmit={handle} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          {/* Full width */}
          <div style={{ gridColumn: '1/-1' }}>
            {field('title', 'Titre de la campagne *', { placeholder: 'Ex: Promo Album Hiver 2025', required: true })}
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Annonceur *</label>
            <select value={form.advertiserId} onChange={e => setForm(p => ({ ...p, advertiserId: e.target.value }))} style={{ width: '100%' }} required>
              {advertisers.map(a => <option key={a.id} value={a.id}>{a.name} {a.company ? `(${a.company})` : ''}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Emplacement *</label>
            <select value={form.placement} onChange={e => setForm(p => ({ ...p, placement: e.target.value }))} style={{ width: '100%' }}>
              {Object.entries(PLACEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            {field('mediaUrl', 'URL du média (vidéo/image) *', { placeholder: 'https://...', type: 'url', required: true })}
            {field('targetUrl', 'URL de destination *', { placeholder: 'https://...', type: 'url', required: true })}
          </div>

          {field('startDate', 'Date de début *', { type: 'date', required: true })}
          {field('endDate', 'Date de fin *', { type: 'date', required: true })}
          {field('maxImpressions', 'Impressions max', { type: 'number', placeholder: 'Illimité si vide', min: 1 })}

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Statut initial</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={{ width: '100%' }}>
              <option value="DRAFT">Brouillon</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">En pause</option>
            </select>
          </div>

          <div style={{ gridColumn: '1/-1' }} className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}><XIcon size={14} /> Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Sauvegarde...' : <><CheckCircleIcon size={14} /> {campaign ? 'Mettre à jour' : 'Créer la campagne'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Analytics Modal ───────────────────────────────────────────────────────────
function AnalyticsModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    adsApi.getCampaignAnalytics(campaign.id).then(setData).catch(() => {});
  }, [campaign.id]);

  const impressions = campaign.currentImpressions || 0;
  const clicks = campaign.currentClicks || 0;
  const maxImp = campaign.maxImpressions || 0;
  const pct = maxImp > 0 ? Math.min((impressions / maxImp) * 100, 100) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChartIcon size={18} /> Analytics — {campaign.title}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { Icon: EyeIcon,   label: 'Impressions', value: impressions.toLocaleString(), color: 'var(--blue)' },
            { Icon: ClickIcon, label: 'Clics',        value: clicks.toLocaleString(),      color: 'var(--green)' },
            { Icon: TargetIcon,label: 'CTR',          value: ctr(impressions, clicks),     color: 'var(--accent)' },
          ].map(({ Icon, label, value, color }) => (
            <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <Icon size={22} color={color} style={{ marginBottom: 6 }} />
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {maxImp > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Progression ({pct.toFixed(1)}%)</span>
              <span>{impressions.toLocaleString()} / {maxImp.toLocaleString()}</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, var(--accent), var(--orange))`, borderRadius: 4, transition: 'width 1s ease' }} />
            </div>
          </div>
        )}

        {data?.dailyStats?.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Activité récente
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead><tr><th>Date</th><th>Impressions</th><th>Clics</th><th>CTR</th></tr></thead>
                <tbody>
                  {data.dailyStats.slice(-10).reverse().map((d: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.date}</td>
                      <td>{(d.impressions || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--green)' }}>{(d.clicks || 0).toLocaleString()}</td>
                      <td><span className="badge badge-purple">{ctr(d.impressions, d.clicks)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}><XIcon size={14} /> Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Main AdsPage ──────────────────────────────────────────────────────────────
export default function AdsPage() {
  const [tab, setTab] = useState<'campaigns' | 'advertisers'>('campaigns');
  const [stats, setStats] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [placementFilter, setPlacementFilter] = useState('');

  const [advertiserModal, setAdvertiserModal] = useState<Advertiser | null | 'new'>(null);
  const [campaignModal, setCampaignModal] = useState<Campaign | null | 'new'>(null);
  const [analyticsModal, setAnalyticsModal] = useState<Campaign | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, a] = await Promise.all([
        adsApi.getStats(),
        adsApi.getCampaigns({ status: statusFilter || '', placement: placementFilter || '' }),
        adsApi.getAdvertisers(),
      ]);
      setStats(s);
      setCampaigns(Array.isArray(c) ? c : []);
      setAdvertisers(Array.isArray(a) ? a : []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [statusFilter, placementFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filter campaigns client-side by search
  const filteredCampaigns = campaigns.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.advertiser?.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (id: string, title: string) => {
    try { await adsApi.toggleCampaignStatus(id); toast.success(`Campagne "${title}" mise à jour`); loadAll(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteCampaign = async (id: string, title: string) => {
    if (!confirm(`Supprimer "${title}" définitivement ?`)) return;
    try { await adsApi.deleteCampaign(id); toast.success('Campagne supprimée'); loadAll(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteAdvertiser = async (id: string, name: string) => {
    if (!confirm(`Supprimer l'annonceur "${name}" et toutes ses campagnes ?`)) return;
    try { await adsApi.deleteAdvertiser(id); toast.success('Annonceur supprimé'); loadAll(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleSaveAdvertiser = async (data: any) => {
    try {
      if (advertiserModal && advertiserModal !== 'new') {
        await adsApi.updateAdvertiser((advertiserModal as Advertiser).id, data);
        toast.success('Annonceur mis à jour');
      } else {
        await adsApi.createAdvertiser(data);
        toast.success('Annonceur créé !');
      }
      setAdvertiserModal(null);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSaveCampaign = async (data: any) => {
    try {
      if (campaignModal && campaignModal !== 'new') {
        await adsApi.updateCampaign((campaignModal as Campaign).id, data);
        toast.success('Campagne mise à jour');
      } else {
        await adsApi.createCampaign(data);
        toast.success('Campagne créée !');
      }
      setCampaignModal(null);
      loadAll();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div>
      {/* Global stats */}
      <GlobalStats stats={stats} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button className={`btn ${tab === 'campaigns' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('campaigns')}>
          <MegaphoneIcon size={14} /> Campagnes ({campaigns.length})
        </button>
        <button className={`btn ${tab === 'advertisers' ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab('advertisers')}>
          <BriefcaseIcon size={14} /> Annonceurs ({advertisers.length})
        </button>
      </div>

      {/* ── CAMPAIGNS ── */}
      {tab === 'campaigns' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar">
              <SearchIcon size={14} color="var(--text-muted)" />
              <input placeholder="Chercher une campagne..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Tous les statuts</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Brouillon</option>
              <option value="PAUSED">En pause</option>
              <option value="COMPLETED">Terminée</option>
            </select>
            <select value={placementFilter} onChange={e => setPlacementFilter(e.target.value)}>
              <option value="">Tous les emplacements</option>
              {Object.entries(PLACEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadAll}><RefreshIcon size={14} /></button>
            <div style={{ marginLeft: 'auto' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setCampaignModal('new')} disabled={advertisers.length === 0}>
                <PlusIcon size={14} /> Nouvelle campagne
              </button>
            </div>
          </div>

          {advertisers.length === 0 && (
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              <BriefcaseIcon size={14} /> Créez d'abord un annonceur avant de lancer une campagne.
            </div>
          )}

          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MegaphoneIcon size={14} /> Campagnes ({filteredCampaigns.length})
              </span>
            </div>

            {loading ? <div className="loading"><div className="spinner" /></div> : (
              filteredCampaigns.length === 0 ? (
                <div className="empty-state">
                  <MegaphoneIcon size={36} style={{ opacity: 0.3 }} />
                  <p>Aucune campagne trouvée</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setCampaignModal('new')}>
                    <PlusIcon size={14} /> Créer une campagne
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Campagne</th>
                      <th>Annonceur</th>
                      <th><PlacementIcon size={11} style={{ verticalAlign: 'middle' }} /> Emplacement</th>
                      <th><EyeIcon size={11} style={{ verticalAlign: 'middle' }} /> Impressions</th>
                      <th><ClickIcon size={11} style={{ verticalAlign: 'middle' }} /> CTR</th>
                      <th><CalendarIcon size={11} style={{ verticalAlign: 'middle' }} /> Durée</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map(c => {
                      const imp = c.currentImpressions || 0;
                      const clk = c.currentClicks || 0;
                      const end = new Date(c.endDate);
                      const expired = end < new Date();
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              <a href={c.targetUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                lien cible ↗
                              </a>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{c.advertiser?.name || '—'}</td>
                          <td><span className="badge badge-blue">{PLACEMENT_LABELS[c.placement] || c.placement}</span></td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{imp.toLocaleString()}</div>
                            {c.maxImpressions && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {c.maxImpressions.toLocaleString()}</div>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${parseFloat(ctr(imp, clk)) > 2 ? 'badge-green' : 'badge-gray'}`}>
                              {ctr(imp, clk)}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <div>{new Date(c.startDate).toLocaleDateString('fr-FR')}</div>
                            <div style={{ color: expired ? 'var(--red)' : 'var(--text-muted)' }}>
                              {expired ? '⚠ ' : ''}{end.toLocaleDateString('fr-FR')}
                            </div>
                          </td>
                          <td><StatusBadge status={c.status} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-sm btn-icon" title="Analytics" onClick={() => setAnalyticsModal(c)}>
                                <BarChartIcon size={14} />
                              </button>
                              <button
                                className={`btn btn-sm btn-icon ${c.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}`}
                                title={c.status === 'ACTIVE' ? 'Mettre en pause' : 'Activer'}
                                onClick={() => handleToggle(c.id, c.title)}
                              >
                                {c.status === 'ACTIVE' ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                              </button>
                              <button className="btn btn-ghost btn-sm btn-icon" title="Modifier" onClick={() => setCampaignModal(c)}>
                                <EditIcon size={14} />
                              </button>
                              <button className="btn btn-danger btn-sm btn-icon" title="Supprimer" onClick={() => handleDeleteCampaign(c.id, c.title)}>
                                <DeleteIcon size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}

      {/* ── ADVERTISERS ── */}
      {tab === 'advertisers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAdvertiserModal('new')}>
              <PlusIcon size={14} /> Nouvel annonceur
            </button>
          </div>

          <div className="table-container">
            <div className="table-header">
              <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BriefcaseIcon size={14} /> Annonceurs ({advertisers.length})
              </span>
            </div>

            {loading ? <div className="loading"><div className="spinner" /></div> : (
              advertisers.length === 0 ? (
                <div className="empty-state">
                  <BriefcaseIcon size={36} style={{ opacity: 0.3 }} />
                  <p>Aucun annonceur. Commencez par en créer un.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setAdvertiserModal('new')}>
                    <PlusIcon size={14} /> Créer un annonceur
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Annonceur</th>
                      <th>Entreprise</th>
                      <th>Contact</th>
                      <th>Campagnes</th>
                      <th>Créé le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advertisers.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{a.company || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {a.contactEmail && <div>{a.contactEmail}</div>}
                          {a.contactPhone && <div style={{ color: 'var(--text-muted)' }}>{a.contactPhone}</div>}
                        </td>
                        <td>
                          <span className="badge badge-purple">
                            {a.campaigns?.length || 0} camp.
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setAdvertiserModal(a)} title="Modifier">
                              <EditIcon size={14} />
                            </button>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDeleteAdvertiser(a.id, a.name)} title="Supprimer">
                              <DeleteIcon size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {advertiserModal && (
        <AdvertiserModal
          advertiser={advertiserModal === 'new' ? undefined : advertiserModal as Advertiser}
          onSave={handleSaveAdvertiser}
          onClose={() => setAdvertiserModal(null)}
        />
      )}
      {campaignModal && (
        <CampaignModal
          campaign={campaignModal === 'new' ? undefined : campaignModal as Campaign}
          advertisers={advertisers}
          onSave={handleSaveCampaign}
          onClose={() => setCampaignModal(null)}
        />
      )}
      {analyticsModal && (
        <AnalyticsModal campaign={analyticsModal} onClose={() => setAnalyticsModal(null)} />
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { adsApi } from '../../adsApi';
import { toast } from '../../App';
import {
  CheckCircleIcon, XCircleIcon, WarningIcon, RefreshIcon,
  GlobeIcon, ServerIcon, ExternalLinkIcon, ActivityIcon, InfoIcon, ZapIcon,
} from '../../icons';

const ADMOB_HELP_URL = 'https://admob.google.com/home/';
const ADMOB_CONSOLE_URL = 'https://apps.admob.com/';

interface PlatformIds {
  appId: string;
  banner: string;
  interstitial: string;
  rewarded: string;
  rewardedInterstitial: string;
  native: string;
  appOpen: string;
}
interface AdMobConfig {
  isEnabled: boolean;
  android: PlatformIds;
  ios: PlatformIds;
  placements: {
    feedBanner: boolean;
    reelInterstitial: boolean;
    trackDetailBanner: boolean;
    afterSongRewarded: boolean;
    appOpenOnLaunch: boolean;
  };
  updatedAt?: string;
}

const EMPTY_PLATFORM: PlatformIds = {
  appId: '', banner: '', interstitial: '', rewarded: '',
  rewardedInterstitial: '', native: '', appOpen: '',
};

const PLACEMENT_LABELS: Record<string, { label: string; desc: string }> = {
  feedBanner:           { label: 'Bannière dans le feed',     desc: 'Affiché entre les pistes dans le fil d\'accueil' },
  reelInterstitial:     { label: 'Interstitiel Reels',        desc: 'Affiché toutes les 3 vidéos dans le feed Reels' },
  trackDetailBanner:    { label: 'Bannière fiche artiste',    desc: 'Affiché en bas de la page de détail d\'un artiste ou d\'une piste' },
  afterSongRewarded:    { label: 'Vidéo récompensée',        desc: 'L\'utilisateur gagne des tokens en regardant une pub complète' },
  appOpenOnLaunch:      { label: 'Pub au lancement de l\'app', desc: 'Interstitiel affiché à chaque ouverture de l\'app (déconseillé)' },
};

const AD_TYPE_LABELS: Record<keyof PlatformIds, string> = {
  appId:               '📱 App ID',
  banner:              'Bannière (Banner)',
  interstitial:        'Interstitiel (Interstitial)',
  rewarded:            'Récompensée (Rewarded)',
  rewardedInterstitial:'Récompensée Interstitiel',
  native:              'Natif (Native)',
  appOpen:             'App Open',
};

function isTestId(id: string) {
  return id.includes('3940256099942544');
}

function PlatformSection({ platform, config, onChange }: {
  platform: 'android' | 'ios';
  config: PlatformIds;
  onChange: (key: keyof PlatformIds, val: string) => void;
}) {
  const isAndroid = platform === 'android';
  const icon = isAndroid ? '🤖' : '';
  const label = isAndroid ? 'Android' : 'iOS';
  const placeholder = isAndroid ? 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX' : 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX';

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {icon} {label}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {(Object.keys(AD_TYPE_LABELS) as (keyof PlatformIds)[]).map(key => (
          <div key={key}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>
              {AD_TYPE_LABELS[key]}
              {key === 'appId' && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={config[key]}
                onChange={e => onChange(key, e.target.value)}
                placeholder={key === 'appId' ? placeholder : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'}
                style={{
                  width: '100%', paddingRight: 32,
                  borderColor: config[key] && isTestId(config[key]) ? 'var(--orange)' : undefined,
                  fontFamily: 'monospace', fontSize: 12,
                }}
              />
              {config[key] && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  {isTestId(config[key])
                    ? <WarningIcon size={13} color="var(--orange)" title="ID de test Google" />
                    : <CheckCircleIcon size={13} color="var(--green)" title="ID de production" />
                  }
                </div>
              )}
            </div>
            {config[key] && isTestId(config[key]) && (
              <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 3 }}>⚠ ID de test Google — remplacez par votre ID de production</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdMobTab() {
  const [config, setConfig] = useState<AdMobConfig | null>(null);
  const [draft, setDraft] = useState<AdMobConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adsApi.getAdMobConfig();
      setConfig(data);
      setDraft(JSON.parse(JSON.stringify(data)));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updatePlatform = (platform: 'android' | 'ios', key: keyof PlatformIds, val: string) => {
    setDraft(prev => prev ? { ...prev, [platform]: { ...prev[platform], [key]: val } } : null);
  };

  const updatePlacement = (key: string, val: boolean) => {
    setDraft(prev => prev ? { ...prev, placements: { ...prev.placements, [key]: val } } : null);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.android.appId || !draft.ios.appId) {
      toast.error('Les App IDs Android et iOS sont obligatoires');
      return;
    }
    setSaving(true);
    try {
      const saved = await adsApi.saveAdMobConfig(draft);
      setConfig(saved);
      setDraft(JSON.parse(JSON.stringify(saved)));
      toast.success('Configuration AdMob sauvegardée ! ✅');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!confirm('Réinitialiser vers les IDs de test Google ? Cela désactivera les vraies publicités.')) return;
    setSaving(true);
    try {
      const data = await adsApi.resetAdMobConfig();
      setConfig(data); setDraft(JSON.parse(JSON.stringify(data)));
      toast.success('Réinitialisé vers les IDs de test');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const hasChanges = draft && config && JSON.stringify(draft) !== JSON.stringify(config);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!draft) return null;

  // Check if any production IDs are configured
  const hasProductionIds = Object.values(draft.android).some(v => v && !isTestId(v)) ||
                           Object.values(draft.ios).some(v => v && !isTestId(v));

  return (
    <div>
      {/* Status Banner */}
      <div className={`alert ${draft.isEnabled ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {draft.isEnabled
            ? <><ZapIcon size={16} color="var(--green)" /> <strong>Google AdMob activé</strong> — Les publicités Google sont diffusées dans l'application</>
            : <><WarningIcon size={16} color="var(--orange)" /> <strong>AdMob désactivé</strong> — Aucune publicité Google n'est diffusée actuellement</>
          }
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ position: 'relative', width: 44, height: 24 }}>
            <input type="checkbox" checked={draft.isEnabled} onChange={e => setDraft(p => p ? { ...p, isEnabled: e.target.checked } : null)} style={{ opacity: 0, width: '100%', height: '100%', position: 'absolute', cursor: 'pointer', zIndex: 1 }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 12,
              background: draft.isEnabled ? 'var(--green)' : 'var(--border)',
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: draft.isEnabled ? 22 : 2, width: 20, height: 20,
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Activer</span>
        </label>
      </div>

      {/* Quick Links */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <a href={ADMOB_CONSOLE_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          <ExternalLinkIcon size={13} /> Console AdMob
        </a>
        <a href={ADMOB_HELP_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
          <InfoIcon size={13} /> Documentation
        </a>
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshIcon size={13} /> Recharger</button>
      </div>

      {/* Production ID warning */}
      {!hasProductionIds && draft.isEnabled && (
        <div className="alert alert-danger" style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
          <XCircleIcon size={14} /> <span><strong>Attention :</strong> Vous avez activé AdMob mais tous vos IDs sont des IDs de test. Les utilisateurs en production ne verront pas de vraies publicités. Renseignez vos IDs de production depuis la <a href={ADMOB_CONSOLE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>console AdMob</a>.</span>
        </div>
      )}

      {/* How to get IDs */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <InfoIcon size={15} /> Comment obtenir mes Ad Unit IDs Google AdMob ?
        </div>
        <ol style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
          <li>Connectez-vous sur <a href={ADMOB_CONSOLE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>apps.admob.com</a></li>
          <li>Créez une application (<strong>Kephale</strong>) pour Android et iOS</li>
          <li>Dans chaque app, créez des blocs d'annonces pour chaque type (Banner, Interstitiel, Rewarded...)</li>
          <li>Copiez l'<strong>App ID</strong> (format <code>ca-app-pub-XXXXX~XXXXX</code>) et les <strong>Ad Unit IDs</strong> (format <code>ca-app-pub-XXXXX/XXXXX</code>)</li>
          <li>Collez les IDs dans les champs ci-dessous, puis cliquez sur <strong>Sauvegarder</strong></li>
          <li>Reconstruisez l'app avec <code>npm run build:android</code> pour que l'App ID soit inclus dans le build</li>
        </ol>
      </div>

      {/* Ad Unit IDs */}
      <div className="grid-2" style={{ marginBottom: 20, gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>
            <GlobeIcon size={14} /> Configuration Android
          </div>
          <PlatformSection platform="android" config={draft.android} onChange={(k, v) => updatePlatform('android', k, v)} />
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>
            <GlobeIcon size={14} /> Configuration iOS
          </div>
          <PlatformSection platform="ios" config={draft.ios} onChange={(k, v) => updatePlatform('ios', k, v)} />
        </div>
      </div>

      {/* Placement Toggles */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <ActivityIcon size={15} /> Emplacements actifs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(PLACEMENT_LABELS).map(([key, { label, desc }]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ position: 'relative', width: 44, height: 24, flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={(draft.placements as any)[key]}
                    onChange={e => updatePlacement(key, e.target.checked)}
                    style={{ opacity: 0, width: '100%', height: '100%', position: 'absolute', cursor: 'pointer', zIndex: 1 }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    background: (draft.placements as any)[key] ? 'var(--green)' : 'var(--border)',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2,
                      left: (draft.placements as any)[key] ? 22 : 2,
                      width: 20, height: 20, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    }} />
                  </div>
                </div>
                <span style={{ fontSize: 12, color: (draft.placements as any)[key] ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {(draft.placements as any)[key] ? 'Actif' : 'Inactif'}
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Last update */}
      {config?.updatedAt && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ServerIcon size={11} /> Dernière mise à jour : {new Date(config.updatedAt).toLocaleString('fr-FR')}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={handleReset} disabled={saving}>
          <RefreshIcon size={14} /> Réinitialiser (IDs test)
        </button>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', padding: '10px 24px', gap: 8 }}
          disabled={saving || !hasChanges}
          onClick={handleSave}
        >
          {saving ? 'Sauvegarde...' : <><CheckCircleIcon size={14} /> Sauvegarder la configuration</>}
        </button>
      </div>
    </div>
  );
}

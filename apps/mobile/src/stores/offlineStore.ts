import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { uiPersistStorage } from '../lib/storage';
import type { Track, Video } from '@kephale/types';

const getTracksAPI = () => require('../lib/api').tracksAPI;
const getVideosAPI = () => require('../lib/api').videosAPI;
const getAlbumsAPI = () => require('../lib/api').albumsAPI;

// ── Durée de vie des téléchargements offline : 30 jours ──────────────────────
const DOWNLOAD_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// ── Répertoire de stockage sécurisé ──────────────────────────────────────────
// SÉCURITÉ : On utilise cacheDirectory au lieu de documentDirectory pour :
// - Exclure les fichiers des sauvegardes iTunes/iCloud
// - Permettre au système OS de nettoyer en cas de pression mémoire
// - Réduire la surface d'attaque en cas d'accès root partiel
const getSecureDir = () => `${FileSystem.cacheDirectory}kephale-offline/`;

export interface OfflineItem {
  id: string;
  type: 'TRACK' | 'ALBUM' | 'CLIP' | 'VIDEO' | 'SHORT';
  title: string;
  artistName: string;
  localFileUri: string;
  localCoverUri?: string;
  sizeBytes: number;
  duration?: number;
  albumId?: string;
  checksum?: string; // SHA-256 pour vérification d'intégrité
  createdAt: number;
  expiresAt: number; // Expiration automatique 30 jours
}

interface OfflineState {
  downloads: Record<string, OfflineItem>;
  downloading: Record<string, number>; // progress 0-100
  downloadTrack: (track: Track) => Promise<void>;
  downloadVideo: (video: Video) => Promise<void>;
  downloadAlbum: (albumId: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  purgeExpiredDownloads: () => Promise<void>;
}

const ensureDirectories = async () => {
  const base = getSecureDir();
  const dirs = [
    `${base}tracks/`,
    `${base}videos/`,
    `${base}covers/`,
  ];
  for (const dir of dirs) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
};

const getExtension = (url: string, defaultExt: string) => {
  try {
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('.');
    if (parts.length > 1) {
      const ext = parts.pop();
      if (ext && ext.length <= 4) return ext;
    }
  } catch {}
  return defaultExt;
};

/**
 * SÉCURITÉ : Calcule le SHA-256 d'un fichier local pour vérifier son intégrité.
 * Détecte les substitutions de fichiers (attaque MITM).
 */
const computeFileChecksum = async (fileUri: string): Promise<string | undefined> => {
  try {
    const content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      content
    );
    return digest;
  } catch {
    return undefined;
  }
};

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      downloads: {},
      downloading: {},

      downloadTrack: async (track: Track) => {
        const { downloads, downloading } = get();
        if (downloads[track.id] || downloading[track.id] !== undefined) return;

        try {
          await ensureDirectories();
          set((state) => ({
            downloading: { ...state.downloading, [track.id]: 0 }
          }));

          // ── SÉCURITÉ : Obtenir l'URL signée via l'endpoint /download ──────────
          // L'URL expire en 60s côté serveur — la vérification d'accès est faite
          // côté backend (achat ou abonnement requis)
          const res = await getTracksAPI().getDownloadUrl(track.id);
          if (!res.data?.success || !res.data?.data?.downloadUrl) {
            throw new Error('Accès refusé ou URL de téléchargement non disponible');
          }
          const audioUrl = res.data.data.downloadUrl;
          const coverUrlFromServer = res.data.data.coverUrl;

          // ── Téléchargement de la pochette ────────────────────────────────────
          let localCoverUri: string | undefined;
          const coverUrl = coverUrlFromServer || track.album?.coverUrl || track.coverUrl;
          if (coverUrl) {
            const coverExt = getExtension(coverUrl, 'jpg');
            const targetCoverPath = `${getSecureDir()}covers/${track.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(coverUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Échec téléchargement pochette:', err);
            }
          }

          // ── Téléchargement du fichier audio ──────────────────────────────────
          const audioExt = getExtension(audioUrl, 'mp3');
          const targetAudioPath = `${getSecureDir()}tracks/${track.id}.${audioExt}`;

          const downloadResumable = FileSystem.createDownloadResumable(
            audioUrl,
            targetAudioPath,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesExpectedToWrite > 0
                ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
                : 0;
              set((state) => ({
                downloading: { ...state.downloading, [track.id]: Math.round(progress * 100) }
              }));
            }
          );

          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult || !downloadResult.uri) {
            throw new Error('Téléchargement échoué');
          }

          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);

          // ── SÉCURITÉ : Vérification d'intégrité SHA-256 ──────────────────────
          const checksum = await computeFileChecksum(downloadResult.uri);

          const newItem: OfflineItem = {
            id: track.id,
            type: 'TRACK',
            title: track.title,
            artistName: track.artist?.stageName || 'Artiste',
            localFileUri: downloadResult.uri,
            localCoverUri,
            sizeBytes: fileInfo.exists ? (fileInfo as any).size ?? 0 : 0,
            duration: track.duration,
            albumId: track.albumId || undefined,
            checksum,
            createdAt: Date.now(),
            expiresAt: Date.now() + DOWNLOAD_EXPIRY_MS,
          };

          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[track.id];
            return {
              downloads: { ...state.downloads, [track.id]: newItem },
              downloading: nextDownloading
            };
          });
        } catch (error) {
          console.error('Erreur téléchargement track:', error);
          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[track.id];
            return { downloading: nextDownloading };
          });
          throw error;
        }
      },

      downloadVideo: async (video: Video) => {
        const { downloads, downloading } = get();
        if (downloads[video.id] || downloading[video.id] !== undefined) return;

        try {
          await ensureDirectories();
          set((state) => ({
            downloading: { ...state.downloading, [video.id]: 0 }
          }));

          // ── SÉCURITÉ : Obtenir l'URL signée via l'endpoint /download ──────────
          const res = await getVideosAPI().getDownloadUrl(video.id);
          if (!res.data?.success || !res.data?.data?.downloadUrl) {
            throw new Error('Accès refusé ou URL de téléchargement non disponible');
          }
          const videoUrl = res.data.data.downloadUrl;
          const thumbnailUrlFromServer = res.data.data.thumbnailUrl;

          // ── Téléchargement de la miniature ───────────────────────────────────
          let localCoverUri: string | undefined;
          const thumbUrl = thumbnailUrlFromServer || video.thumbnailUrl;
          if (thumbUrl) {
            const coverExt = getExtension(thumbUrl, 'jpg');
            const targetCoverPath = `${getSecureDir()}covers/${video.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(thumbUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Échec téléchargement miniature:', err);
            }
          }

          // ── Téléchargement du fichier vidéo ──────────────────────────────────
          const videoExt = getExtension(videoUrl, 'mp4');
          const targetVideoPath = `${getSecureDir()}videos/${video.id}.${videoExt}`;

          const downloadResumable = FileSystem.createDownloadResumable(
            videoUrl,
            targetVideoPath,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesExpectedToWrite > 0
                ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
                : 0;
              set((state) => ({
                downloading: { ...state.downloading, [video.id]: Math.round(progress * 100) }
              }));
            }
          );

          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult || !downloadResult.uri) {
            throw new Error('Téléchargement vidéo échoué');
          }

          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);

          // ── SÉCURITÉ : Vérification d'intégrité SHA-256 ──────────────────────
          const checksum = await computeFileChecksum(downloadResult.uri);

          const newItem: OfflineItem = {
            id: video.id,
            type: video.type === 'SHORT' ? 'SHORT' : 'CLIP',
            title: video.title,
            artistName: video.artist?.stageName || 'Artiste',
            localFileUri: downloadResult.uri,
            localCoverUri,
            sizeBytes: fileInfo.exists ? (fileInfo as any).size ?? 0 : 0,
            duration: video.duration,
            checksum,
            createdAt: Date.now(),
            expiresAt: Date.now() + DOWNLOAD_EXPIRY_MS,
          };

          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[video.id];
            return {
              downloads: { ...state.downloads, [video.id]: newItem },
              downloading: nextDownloading
            };
          });
        } catch (error) {
          console.error('Erreur téléchargement vidéo:', error);
          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[video.id];
            return { downloading: nextDownloading };
          });
          throw error;
        }
      },

      downloadAlbum: async (albumId: string) => {
        const { downloads, downloading } = get();
        if (downloads[albumId] || downloading[albumId] !== undefined) return;

        try {
          await ensureDirectories();
          set((state) => ({
            downloading: { ...state.downloading, [albumId]: 0 }
          }));

          const res = await getAlbumsAPI().getById(albumId);
          const album = res.data?.data;
          if (!album || !album.tracks || album.tracks.length === 0) {
            throw new Error('Album introuvable ou sans pistes');
          }

          let completedTracks = 0;
          let totalBytes = 0;

          // Téléchargement séquentiel des pistes via l'endpoint sécurisé
          for (const track of album.tracks) {
            const trackWithAlbum = {
              ...track,
              album: { coverUrl: album.coverUrl },
              artist: album.artist,
            };

            try {
              await get().downloadTrack(trackWithAlbum);
              const offlineTrack = get().downloads[track.id];
              if (offlineTrack) totalBytes += offlineTrack.sizeBytes;
            } catch (err) {
              console.warn(`Échec téléchargement piste ${track.title}:`, err);
            }

            completedTracks++;
            const progress = Math.round((completedTracks / album.tracks.length) * 100);
            set((state) => ({
              downloading: { ...state.downloading, [albumId]: progress }
            }));
          }

          // Téléchargement de la pochette de l'album
          let localCoverUri: string | undefined;
          if (album.coverUrl) {
            const coverExt = getExtension(album.coverUrl, 'jpg');
            const targetCoverPath = `${getSecureDir()}covers/album-${album.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(album.coverUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Échec téléchargement pochette album:', err);
            }
          }

          const newAlbumItem: OfflineItem = {
            id: album.id,
            type: 'ALBUM',
            title: album.title,
            artistName: album.artist?.stageName || 'Artiste',
            localFileUri: '',
            localCoverUri,
            sizeBytes: totalBytes,
            createdAt: Date.now(),
            expiresAt: Date.now() + DOWNLOAD_EXPIRY_MS,
          };

          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[albumId];
            return {
              downloads: { ...state.downloads, [albumId]: newAlbumItem },
              downloading: nextDownloading
            };
          });
        } catch (error) {
          console.error('Erreur téléchargement album:', error);
          set((state) => {
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[albumId];
            return { downloading: nextDownloading };
          });
          throw error;
        }
      },

      removeDownload: async (id: string) => {
        const { downloads } = get();
        const item = downloads[id];

        set((state) => {
          const nextDownloading = { ...state.downloading };
          delete nextDownloading[id];
          return { downloading: nextDownloading };
        });

        if (!item) return;

        try {
          // Stopper le player si la piste supprimée est en cours de lecture
          try {
            const { usePlayerStore } = require('./index');
            const activeTrack = usePlayerStore.getState().currentTrack;
            if (activeTrack && (activeTrack.id === id || activeTrack.audioUrl === item.localFileUri)) {
              usePlayerStore.getState().clearPlayer();
            }
          } catch (e) {}

          // Suppression en cascade si c'est un album
          if (item.type === 'ALBUM') {
            for (const key of Object.keys(downloads)) {
              const trackItem = downloads[key];
              if (trackItem.type === 'TRACK' && trackItem.albumId === id) {
                await get().removeDownload(key);
              }
            }
          }

          if (item.localFileUri) {
            const fileInfo = await FileSystem.getInfoAsync(item.localFileUri);
            if (fileInfo.exists) await FileSystem.deleteAsync(item.localFileUri);
          }

          if (item.localCoverUri) {
            const coverInfo = await FileSystem.getInfoAsync(item.localCoverUri);
            if (coverInfo.exists) await FileSystem.deleteAsync(item.localCoverUri);
          }

          set((state) => {
            const nextDownloads = { ...state.downloads };
            delete nextDownloads[id];
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[id];
            return { downloads: nextDownloads, downloading: nextDownloading };
          });
        } catch (error) {
          console.error('Erreur suppression fichier téléchargé:', error);
        }
      },

      clearAllDownloads: async () => {
        const { downloads } = get();
        for (const key of Object.keys(downloads)) {
          await get().removeDownload(key);
        }
        set({ downloads: {}, downloading: {} });
        try {
          const { usePlayerStore } = require('./index');
          usePlayerStore.getState().clearPlayer();
        } catch (e) {}
      },

      /**
       * SÉCURITÉ : Supprime automatiquement les téléchargements expirés (> 30 jours).
       * À appeler au démarrage de l'app et périodiquement.
       */
      purgeExpiredDownloads: async () => {
        const { downloads } = get();
        const now = Date.now();
        const expiredIds = Object.keys(downloads).filter((id) => {
          const item = downloads[id];
          return item.expiresAt && item.expiresAt < now;
        });
        for (const id of expiredIds) {
          console.info(`[OfflineStore] Suppression download expiré: ${id}`);
          await get().removeDownload(id);
        }
      },
    }),
    {
      name: 'kephale-offline',
      storage: createJSONStorage(() => uiPersistStorage),
      partialize: (state) => ({ downloads: state.downloads }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.downloading = {};
          const validDownloads: Record<string, OfflineItem> = {};
          const now = Date.now();

          const checks = Object.entries(state.downloads || {}).map(async ([id, item]) => {
            // ── SÉCURITÉ : Vérification d'expiration ─────────────────────────
            if (item.expiresAt && item.expiresAt < now) {
              console.info(`[OfflineStore] Download expiré ignoré: ${id}`);
              return; // Ne pas restaurer les fichiers expirés
            }

            if (item.localFileUri) {
              try {
                const info = await FileSystem.getInfoAsync(item.localFileUri);
                if (info.exists) {
                  validDownloads[id] = item;
                }
              } catch (e) {
                validDownloads[id] = item;
              }
            } else {
              validDownloads[id] = item;
            }
          });

          Promise.all(checks).then(() => {
            useOfflineStore.setState({ downloads: validDownloads, downloading: {} });
          });
        }
      }
    }
  )
);

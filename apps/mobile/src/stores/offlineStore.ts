import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as FileSystem from 'expo-file-system/legacy';
import { uiPersistStorage } from '../lib/storage';
import type { Track, Video } from '@kephale/types';
import { rewriteUrl } from '../lib/url';

const getTracksAPI = () => require('../lib/api').tracksAPI;
const getVideosAPI = () => require('../lib/api').videosAPI;
const getAlbumsAPI = () => require('../lib/api').albumsAPI;

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
  createdAt: number;
}

interface OfflineState {
  downloads: Record<string, OfflineItem>;
  downloading: Record<string, number>; // progress 0-100
  downloadTrack: (track: Track) => Promise<void>;
  downloadVideo: (video: Video) => Promise<void>;
  downloadAlbum: (albumId: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
}

const ensureDirectories = async () => {
  const dirs = [
    `${FileSystem.documentDirectory}downloads/tracks/`,
    `${FileSystem.documentDirectory}downloads/videos/`,
    `${FileSystem.documentDirectory}downloads/covers/`
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

// URL rewriting is imported from lib/url

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

          // 1. Get stream/media URL
          let audioUrl = track.audioUrl;
          if (track.s3Key) {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (!API_URL && !__DEV__) throw new Error("EXPO_PUBLIC_API_URL is not defined in production");
            const safeApiUrl = API_URL || 'http://localhost:4000';
            try {
              const apiHost = new URL(safeApiUrl).hostname;
              audioUrl = `http://${apiHost}:9000/kephale-media/${track.s3Key}`;
            } catch (e) {
              console.warn("Failed to construct S3 download URL:", e);
            }
          } else if (track.price > 0) {
            const res = await getTracksAPI().getStreamUrl(track.id);
            if (res.data?.success && res.data?.data?.streamUrl) {
              audioUrl = res.data.data.streamUrl;
            }
          }

          if (!audioUrl) {
            throw new Error('Streaming URL not available');
          }

          const API_URL = process.env.EXPO_PUBLIC_API_URL;
          if (!API_URL && !__DEV__) throw new Error("EXPO_PUBLIC_API_URL is not defined in production");
          const safeApiUrl = API_URL || 'http://localhost:4000';
          const finalAudioUrl = rewriteUrl(audioUrl.startsWith('http') ? audioUrl : `${safeApiUrl}${audioUrl}`);

          // 2. Download Cover Image
          let localCoverUri: string | undefined;
          const coverUrl = track.album?.coverUrl || track.coverUrl;
          if (coverUrl) {
            const cleanCoverUrl = rewriteUrl(coverUrl.startsWith('http') ? coverUrl : `${safeApiUrl}${coverUrl}`);
            const coverExt = getExtension(cleanCoverUrl, 'jpg');
            const targetCoverPath = `${FileSystem.documentDirectory}downloads/covers/${track.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(cleanCoverUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Failed to download cover image offline:', err);
            }
          }

          // 3. Download Audio file
          const audioExt = getExtension(finalAudioUrl, 'mp3');
          const targetAudioPath = `${FileSystem.documentDirectory}downloads/tracks/${track.id}.${audioExt}`;

          const downloadResumable = FileSystem.createDownloadResumable(
            finalAudioUrl,
            targetAudioPath,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
              set((state) => ({
                downloading: { ...state.downloading, [track.id]: Math.round(progress * 100) }
              }));
            }
          );

          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult || !downloadResult.uri) {
            throw new Error('Download failed');
          }

          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);

          const newItem: OfflineItem = {
            id: track.id,
            type: 'TRACK',
            title: track.title,
            artistName: track.artist?.stageName || 'Artiste',
            localFileUri: downloadResult.uri,
            localCoverUri,
            sizeBytes: fileInfo.exists ? fileInfo.size : 0,
            duration: track.duration,
            albumId: track.albumId || undefined,
            createdAt: Date.now()
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
          console.error('Error downloading track:', error);
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

          // 1. Get stream/media URL
          let videoUrl = video.videoUrl;
          if (video.price > 0) {
            const res = await getVideosAPI().getStreamUrl(video.id);
            if (res.data?.success && res.data?.data?.streamUrl) {
              videoUrl = res.data.data.streamUrl;
            }
          }

          if (!videoUrl) {
            throw new Error('Streaming URL not available');
          }

          const API_URL = process.env.EXPO_PUBLIC_API_URL;
          if (!API_URL && !__DEV__) throw new Error("EXPO_PUBLIC_API_URL is not defined in production");
          const safeApiUrl = API_URL || 'http://localhost:4000';
          const finalVideoUrl = rewriteUrl(videoUrl.startsWith('http') ? videoUrl : `${safeApiUrl}${videoUrl}`);

          // 2. Download Thumbnail Cover Image
          let localCoverUri: string | undefined;
          if (video.thumbnailUrl) {
            const cleanCoverUrl = rewriteUrl(video.thumbnailUrl.startsWith('http') ? video.thumbnailUrl : `${safeApiUrl}${video.thumbnailUrl}`);
            const coverExt = getExtension(cleanCoverUrl, 'jpg');
            const targetCoverPath = `${FileSystem.documentDirectory}downloads/covers/${video.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(cleanCoverUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Failed to download video thumbnail offline:', err);
            }
          }

          // 3. Download Video file
          const videoExt = getExtension(finalVideoUrl, 'mp4');
          const targetVideoPath = `${FileSystem.documentDirectory}downloads/videos/${video.id}.${videoExt}`;

          const downloadResumable = FileSystem.createDownloadResumable(
            finalVideoUrl,
            targetVideoPath,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
              set((state) => ({
                downloading: { ...state.downloading, [video.id]: Math.round(progress * 100) }
              }));
            }
          );

          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult || !downloadResult.uri) {
            throw new Error('Download failed');
          }

          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);

          const newItem: OfflineItem = {
            id: video.id,
            type: video.type === 'SHORT' ? 'SHORT' : 'CLIP',
            title: video.title,
            artistName: video.artist?.stageName || 'Artiste',
            localFileUri: downloadResult.uri,
            localCoverUri,
            sizeBytes: fileInfo.exists ? fileInfo.size : 0,
            duration: video.duration,
            createdAt: Date.now()
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
          console.error('Error downloading video:', error);
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
            throw new Error('Album not found or has no tracks');
          }

          let completedTracks = 0;
          let totalBytes = 0;

          // Download tracks sequentially
          for (const track of album.tracks) {
            const trackWithAlbum = {
              ...track,
              album: {
                coverUrl: album.coverUrl
              },
              artist: album.artist
            };

            try {
              await get().downloadTrack(trackWithAlbum);
              // Accumulate size from downloaded track
              const offlineTrack = get().downloads[track.id];
              if (offlineTrack) {
                totalBytes += offlineTrack.sizeBytes;
              }
            } catch (err) {
              console.warn(`Failed to download album track ${track.title}:`, err);
            }

            completedTracks++;
            const progress = Math.round((completedTracks / album.tracks.length) * 100);
            set((state) => ({
              downloading: { ...state.downloading, [albumId]: progress }
            }));
          }

          // Download Album Cover local metadata
          const API_URL = process.env.EXPO_PUBLIC_API_URL;
          if (!API_URL && !__DEV__) throw new Error("EXPO_PUBLIC_API_URL is not defined in production");
          const safeApiUrl = API_URL || 'http://localhost:4000';
          let localCoverUri: string | undefined;
          if (album.coverUrl) {
            const cleanCoverUrl = rewriteUrl(album.coverUrl.startsWith('http') ? album.coverUrl : `${safeApiUrl}${album.coverUrl}`);
            const coverExt = getExtension(cleanCoverUrl, 'jpg');
            const targetCoverPath = `${FileSystem.documentDirectory}downloads/covers/album-${album.id}.${coverExt}`;
            try {
              const coverDownload = await FileSystem.downloadAsync(cleanCoverUrl, targetCoverPath);
              localCoverUri = coverDownload.uri;
            } catch (err) {
              console.warn('Failed to download album cover image:', err);
            }
          }

          const newAlbumItem: OfflineItem = {
            id: album.id,
            type: 'ALBUM',
            title: album.title,
            artistName: album.artist?.stageName || 'Artiste',
            localFileUri: '', // album contains multiple tracks
            localCoverUri,
            sizeBytes: totalBytes,
            createdAt: Date.now()
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
          console.error('Error downloading album:', error);
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

        // Ensure downloading progress state for this item is cleared regardless
        set((state) => {
          const nextDownloading = { ...state.downloading };
          delete nextDownloading[id];
          return { downloading: nextDownloading };
        });

        if (!item) return;

        try {
          // If active track in player matches deleted item, stop player immediately
          try {
            const { usePlayerStore } = require('./index');
            const activeTrack = usePlayerStore.getState().currentTrack;
            if (activeTrack && (activeTrack.id === id || activeTrack.audioUrl === item.localFileUri)) {
              usePlayerStore.getState().clearPlayer();
            }
          } catch (e) {}

          // If this is an album, cascade delete its tracks
          if (item.type === 'ALBUM') {
            for (const key of Object.keys(downloads)) {
              const trackItem = downloads[key];
              if (trackItem.type === 'TRACK' && trackItem.albumId === id) {
                await get().removeDownload(key);
              }
            }
          }

          // Delete main file if it's set
          if (item.localFileUri) {
            const fileInfo = await FileSystem.getInfoAsync(item.localFileUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(item.localFileUri);
            }
          }

          // Delete cover if exists
          if (item.localCoverUri) {
            const coverInfo = await FileSystem.getInfoAsync(item.localCoverUri);
            if (coverInfo.exists) {
              await FileSystem.deleteAsync(item.localCoverUri);
            }
          }

          set((state) => {
            const nextDownloads = { ...state.downloads };
            delete nextDownloads[id];
            const nextDownloading = { ...state.downloading };
            delete nextDownloading[id];
            return { downloads: nextDownloads, downloading: nextDownloading };
          });
        } catch (error) {
          console.error('Error deleting downloaded file:', error);
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
      }
    }),
    {
      name: 'kephale-offline',
      storage: createJSONStorage(() => uiPersistStorage),
      partialize: (state) => ({ downloads: state.downloads }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.downloading = {};
          const validDownloads: Record<string, OfflineItem> = {};
          const checks = Object.entries(state.downloads || {}).map(async ([id, item]) => {
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

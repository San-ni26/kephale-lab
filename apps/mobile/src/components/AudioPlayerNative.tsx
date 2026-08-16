/**
 * AudioPlayerNative — react-native-track-player
 *
 * Ce fichier n'est chargé QUE dans les Dev Builds et builds de production.
 * Tous les hooks sont appelés au niveau racine du composant (règles React respectées).
 * NE PAS importer ce fichier directement — passer par GlobalAudioPlayer.tsx.
 */
import { useEffect, useRef } from 'react';
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
  useProgress,
} from 'react-native-track-player';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlayerStore, useOfflineStore } from '../stores/index';
import { tracksAPI, getDynamicApiUrl } from '../lib/api';
import { rewriteUrl } from '../lib/url';
import { hapticFeedback } from '../lib/haptics';
import { ensureTrackPlayerSetup } from '../lib/trackPlayerSetup';

const API_URL = getDynamicApiUrl();

async function resolveUri(track: any): Promise<string | null> {
  const offlineItem = useOfflineStore.getState().downloads[track.id];
  const rawUrl = track.audioUrl || '';
  let uri = offlineItem?.localFileUri
    ? offlineItem.localFileUri
    : rawUrl.startsWith('http')
    ? rawUrl
    : rawUrl
    ? `${API_URL}${rawUrl}`
    : '';

  if (!uri) return null;
  if (uri.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        uri = rawUrl.startsWith('http') ? rawUrl : `${API_URL}${rawUrl}`;
        if (!uri || uri.endsWith('/')) return null;
      }
    } catch {}
  }
  return rewriteUrl(uri);
}

export default function AudioPlayerNative() {
  const { currentTrack, queue, isPlaying, setProgress, setPlaying } = usePlayerStore();
  const prevTrackId = useRef<string | null>(null);

  // All hooks called unconditionally at top level ✅
  const { position, duration } = useProgress(250);

  // Initialize TrackPlayer once
  useEffect(() => {
    ensureTrackPlayerSetup();
  }, []);

  // Sync progress to Zustand
  useEffect(() => {
    if (duration > 0) setProgress(position, duration);
  }, [position, duration]);

  // Load + play when track changes
  useEffect(() => {
    if (!currentTrack) {
      TrackPlayer.reset().catch(() => {});
      prevTrackId.current = null;
      return;
    }
    if (currentTrack.id === prevTrackId.current) return;
    prevTrackId.current = currentTrack.id;

    (async () => {
      try {
        const tracksToLoad = queue.length > 0 ? queue : [currentTrack];
        const tpTracks = await Promise.all(
          tracksToLoad.map(async (t) => {
            const tUri = await resolveUri(t);
            const offlineItem = useOfflineStore.getState().downloads[t.id];
            return {
              id: t.id,
              url: tUri || '',
              title: t.title,
              artist: t.artist?.stageName || (t as any).artistName || 'Artiste',
              album: t.album?.title || '',
              artwork:
                offlineItem?.localCoverUri ||
                t.coverUrl ||
                t.album?.coverUrl ||
                undefined,
              duration: t.duration,
            };
          })
        );

        const valid = tpTracks.filter((t) => !!t.url);
        if (valid.length === 0) {
          usePlayerStore.getState().clearPlayer();
          return;
        }

        await TrackPlayer.reset();
        await TrackPlayer.add(valid);

        const idx = valid.findIndex((t) => t.id === currentTrack.id);
        if (idx > 0) await TrackPlayer.skip(idx);
        await TrackPlayer.play();

        tracksAPI.play(currentTrack.id).catch(() => {});
        hapticFeedback.medium().catch(() => {});
      } catch (err) {
        console.error('[AudioPlayerNative] Error:', err);
        hapticFeedback.error().catch(() => {});
      }
    })();
  }, [currentTrack?.id]);

  // Sync play/pause
  useEffect(() => {
    if (!currentTrack) return;
    (async () => {
      try {
        const state = await TrackPlayer.getState();
        if (isPlaying && state !== State.Playing) await TrackPlayer.play();
        else if (!isPlaying && state === State.Playing) await TrackPlayer.pause();
      } catch {}
    })();
  }, [isPlaying]);

  // TrackPlayer events → Zustand
  useTrackPlayerEvents(
    [Event.PlaybackState, Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded],
    async (event) => {
      if (event.type === Event.PlaybackState) {
        const playing = event.state === State.Playing;
        if (playing !== usePlayerStore.getState().isPlaying) setPlaying(playing);
      }
      if (event.type === Event.PlaybackActiveTrackChanged) {
        const tpTrack = await TrackPlayer.getActiveTrack();
        if (!tpTrack?.id) return;
        const { queue: q, currentTrack: cur } = usePlayerStore.getState();
        if (tpTrack.id !== cur?.id) {
          const found = q.find((t) => t.id === tpTrack.id);
          if (found) {
            prevTrackId.current = found.id;
            usePlayerStore.setState({ currentTrack: found, isPlaying: true });
          }
        }
      }
      if (event.type === Event.PlaybackQueueEnded) {
        usePlayerStore.getState().clearPlayer();
      }
    }
  );

  return null;
}

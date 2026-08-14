/**
 * GlobalAudioPlayer — react-native-track-player engine
 *
 * Remplace expo-av par react-native-track-player pour obtenir :
 * - Notification de lecteur Android (play/pause/next/prev depuis la barre)
 * - Contrôles sur l'écran de verrouillage iOS
 * - Contrôles Bluetooth / écouteurs
 * - Lecture réelle en arrière-plan même quand l'app est fermée
 *
 * Architecture :
 * 1. TrackPlayer est initialisé une seule fois au démarrage (singleton).
 * 2. Le Zustand PlayerStore reste la source de vérité côté UI.
 * 3. Ce composant synchronise PlayerStore → TrackPlayer (charger/lire/pause).
 * 4. Les events TrackPlayer → PlayerStore (fin de piste, avance auto, etc.).
 */

import { useEffect, useRef } from 'react';
import TrackPlayer, {
  Capability,
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

const API_URL = getDynamicApiUrl();

// ── TrackPlayer singleton setup ───────────────────────────────────────────────
let isTrackPlayerSetup = false;

async function setupTrackPlayer() {
  if (isTrackPlayerSetup) return;
  try {
    await TrackPlayer.setupPlayer({
      // Buffer 60s pour une lecture fluide sur connexion lente
      minBuffer: 15,
      maxBuffer: 60,
      playBuffer: 5,
      backBuffer: 30,
    });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      // Android notification icon
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
    });

    isTrackPlayerSetup = true;
  } catch (err) {
    // setupPlayer peut lever si déjà appelé — on ignore silencieusement
    isTrackPlayerSetup = true;
  }
}

// ── Build a TrackPlayer track object ─────────────────────────────────────────
async function resolveTrackUri(track: any): Promise<string | null> {
  const offlineItem = useOfflineStore.getState().downloads[track.id];
  const rawAudioUrl = track.audioUrl || '';

  let uri = offlineItem?.localFileUri
    ? offlineItem.localFileUri
    : rawAudioUrl.startsWith('http')
    ? rawAudioUrl
    : rawAudioUrl
    ? `${API_URL}${rawAudioUrl}`
    : '';

  if (!uri) return null;

  // Validate local file exists
  if (uri.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        // Fallback to remote
        uri = rawAudioUrl.startsWith('http') ? rawAudioUrl : `${API_URL}${rawAudioUrl}`;
        if (!uri || uri.endsWith('/')) return null;
      }
    } catch {
      // keep uri as-is
    }
  }

  return rewriteUrl(uri);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GlobalAudioPlayer() {
  const { currentTrack, queue, isPlaying, setProgress, setPlaying, nextTrack } = usePlayerStore();
  const prevTrackId = useRef<string | null>(null);
  const { position, duration } = useProgress(250);

  // Setup player once on mount
  useEffect(() => {
    setupTrackPlayer();
  }, []);

  // Sync progress from TrackPlayer → Zustand
  useEffect(() => {
    if (duration > 0) {
      setProgress(position, duration);
    }
  }, [position, duration]);

  // Track change: load & play new track in TrackPlayer
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
        const uri = await resolveTrackUri(currentTrack);
        if (!uri) {
          console.warn('[GlobalAudioPlayer] No valid URI for track:', currentTrack.id);
          usePlayerStore.getState().clearPlayer();
          return;
        }

        // Build the queue for TrackPlayer
        const tpTracks = await Promise.all(
          (queue.length > 0 ? queue : [currentTrack]).map(async (t) => {
            const tUri = await resolveTrackUri(t);
            const offlineItem = useOfflineStore.getState().downloads[t.id];
            return {
              id: t.id,
              url: tUri || '',
              title: t.title,
              artist: t.artist?.stageName || t.artistName || 'Artiste',
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

        // Filter out tracks with no URL
        const validTracks = tpTracks.filter((t) => t.url);

        if (validTracks.length === 0) return;

        await TrackPlayer.reset();
        await TrackPlayer.add(validTracks);

        // Jump to current track within queue
        const currentIdx = validTracks.findIndex((t) => t.id === currentTrack.id);
        if (currentIdx > 0) {
          await TrackPlayer.skip(currentIdx);
        }

        await TrackPlayer.play();

        // Track play count
        tracksAPI.play(currentTrack.id).catch(() => {});
        hapticFeedback.medium().catch(() => {});
      } catch (err) {
        console.error('[GlobalAudioPlayer] Error loading track:', err);
        hapticFeedback.error().catch(() => {});
      }
    })();
  }, [currentTrack?.id]);

  // Play / Pause sync: Zustand → TrackPlayer
  useEffect(() => {
    if (!currentTrack) return;
    (async () => {
      try {
        const state = await TrackPlayer.getState();
        if (isPlaying && state !== State.Playing) {
          await TrackPlayer.play();
        } else if (!isPlaying && state === State.Playing) {
          await TrackPlayer.pause();
        }
      } catch {}
    })();
  }, [isPlaying]);

  // TrackPlayer → Zustand: sync playback events
  useTrackPlayerEvents(
    [Event.PlaybackState, Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded],
    async (event) => {
      if (event.type === Event.PlaybackState) {
        const playing = event.state === State.Playing;
        const zustandPlaying = usePlayerStore.getState().isPlaying;
        if (playing !== zustandPlaying) {
          setPlaying(playing);
        }
      }

      if (event.type === Event.PlaybackActiveTrackChanged) {
        // User changed track from notification (next/prev)
        const tpTrack = await TrackPlayer.getActiveTrack();
        if (!tpTrack?.id) return;

        const zustandQueue = usePlayerStore.getState().queue;
        const zustandCurrent = usePlayerStore.getState().currentTrack;

        if (tpTrack.id !== zustandCurrent?.id) {
          const newTrack = zustandQueue.find((t) => t.id === tpTrack.id);
          if (newTrack) {
            // Update Zustand without reloading TrackPlayer (it already changed)
            prevTrackId.current = newTrack.id;
            usePlayerStore.setState({ currentTrack: newTrack, isPlaying: true });
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

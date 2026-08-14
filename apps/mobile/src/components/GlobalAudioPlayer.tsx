/**
 * GlobalAudioPlayer — Smart audio engine
 *
 * Mode adaptatif :
 * - Expo Go / simulateur sans module natif → expo-av (lecture basique, pas de bg controls)
 * - Dev Build / Production → react-native-track-player (notification, lock screen, Bluetooth)
 *
 * Le code détecte automatiquement si TrackPlayer est disponible
 * pour ne pas crasher en Expo Go.
 */

import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlayerStore, useOfflineStore } from '../stores/index';
import { tracksAPI, getDynamicApiUrl } from '../lib/api';
import { rewriteUrl } from '../lib/url';
import { hapticFeedback } from '../lib/haptics';

const API_URL = getDynamicApiUrl();

// Detect if running inside Expo Go (no native modules)
const isExpoGo = Constants.appOwnership === 'expo';

// ── Resolve audio URI (shared logic) ─────────────────────────────────────────
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

  if (uri.startsWith('file://')) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        uri = rawAudioUrl.startsWith('http') ? rawAudioUrl : `${API_URL}${rawAudioUrl}`;
        if (!uri || uri.endsWith('/')) return null;
      }
    } catch {}
  }

  return rewriteUrl(uri);
}

// ── expo-av fallback player (Expo Go) ────────────────────────────────────────
function ExpoAvPlayer() {
  const { currentTrack, isPlaying, setProgress, nextTrack } = usePlayerStore();
  const soundRef = useRef<any>(null);
  const currentTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Lazy import expo-av only in Expo Go
    const { Audio, InterruptionModeIOS, InterruptionModeAndroid } = require('expo-av');
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentTrack) {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      currentTrackIdRef.current = null;
      return;
    }

    if (currentTrack.id === currentTrackIdRef.current) return;
    currentTrackIdRef.current = currentTrack.id;

    (async () => {
      const { Audio } = require('expo-av');
      if (soundRef.current) {
        try { await soundRef.current.stopAsync(); } catch {}
        try { await soundRef.current.unloadAsync(); } catch {}
        soundRef.current = null;
      }

      const uri = await resolveTrackUri(currentTrack);
      if (!uri) { usePlayerStore.getState().clearPlayer(); return; }

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          (status: any) => {
            if (status.isLoaded) {
              setProgress(status.positionMillis / 1000, (status.durationMillis || 0) / 1000);
              if (status.didJustFinish) nextTrack();
            }
          },
          false
        );
        soundRef.current = sound;
        tracksAPI.play(currentTrack.id).catch(() => {});
        hapticFeedback.medium().catch(() => {});
      } catch (err) {
        console.error('[ExpoAvPlayer] Error loading track:', err);
        hapticFeedback.error().catch(() => {});
      }
    })();
  }, [currentTrack?.id]);

  useEffect(() => {
    (async () => {
      if (!soundRef.current) return;
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying && !status.isPlaying) await soundRef.current.playAsync();
          else if (!isPlaying && status.isPlaying) await soundRef.current.pauseAsync();
        }
      } catch {}
    })();
  }, [isPlaying]);

  return null;
}

// ── TrackPlayer engine (Dev Build / Production) ───────────────────────────────
function TrackPlayerEngine() {
  const { currentTrack, queue, isPlaying, setProgress, setPlaying } = usePlayerStore();
  const prevTrackId = useRef<string | null>(null);

  // Lazy imports so this file doesn't crash in Expo Go
  const TrackPlayer = require('react-native-track-player').default;
  const { Capability, Event, State, useTrackPlayerEvents, useProgress } =
    require('react-native-track-player');

  const isTrackPlayerSetupRef = useRef(false);

  useEffect(() => {
    if (isTrackPlayerSetupRef.current) return;
    (async () => {
      try {
        await TrackPlayer.setupPlayer({ minBuffer: 15, maxBuffer: 60, playBuffer: 5, backBuffer: 30 });
        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
          notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
        });
        isTrackPlayerSetupRef.current = true;
      } catch {
        isTrackPlayerSetupRef.current = true;
      }
    })();
  }, []);

  // Sync progress
  const { position, duration } = useProgress(250);
  useEffect(() => {
    if (duration > 0) setProgress(position, duration);
  }, [position, duration]);

  // Track change
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
        if (!uri) { usePlayerStore.getState().clearPlayer(); return; }

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
              artwork: offlineItem?.localCoverUri || t.coverUrl || t.album?.coverUrl || undefined,
              duration: t.duration,
            };
          })
        );

        const validTracks = tpTracks.filter((t) => t.url);
        if (validTracks.length === 0) return;

        await TrackPlayer.reset();
        await TrackPlayer.add(validTracks);

        const idx = validTracks.findIndex((t) => t.id === currentTrack.id);
        if (idx > 0) await TrackPlayer.skip(idx);
        await TrackPlayer.play();

        tracksAPI.play(currentTrack.id).catch(() => {});
        hapticFeedback.medium().catch(() => {});
      } catch (err) {
        console.error('[TrackPlayerEngine] Error loading track:', err);
        hapticFeedback.error().catch(() => {});
      }
    })();
  }, [currentTrack?.id]);

  // Play/Pause sync
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

  // TrackPlayer → Zustand events
  useTrackPlayerEvents([Event.PlaybackState, Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded], async (event: any) => {
    if (event.type === Event.PlaybackState) {
      const playing = event.state === State.Playing;
      if (playing !== usePlayerStore.getState().isPlaying) setPlaying(playing);
    }
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const tpTrack = await TrackPlayer.getActiveTrack();
      if (!tpTrack?.id) return;
      const zustandQueue = usePlayerStore.getState().queue;
      const zustandCurrent = usePlayerStore.getState().currentTrack;
      if (tpTrack.id !== zustandCurrent?.id) {
        const newTrack = zustandQueue.find((t: any) => t.id === tpTrack.id);
        if (newTrack) {
          prevTrackId.current = newTrack.id;
          usePlayerStore.setState({ currentTrack: newTrack, isPlaying: true });
        }
      }
    }
    if (event.type === Event.PlaybackQueueEnded) {
      usePlayerStore.getState().clearPlayer();
    }
  });

  return null;
}

// ── Main export: picks the right engine ──────────────────────────────────────
export default function GlobalAudioPlayer() {
  if (isExpoGo) {
    // Expo Go: use expo-av (no background controls, but app works normally)
    return ExpoAvPlayer();
  }
  // Dev Build / Production: full TrackPlayer with background controls
  return TrackPlayerEngine();
}

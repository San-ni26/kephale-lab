/**
 * AudioPlayerFallback — expo-av
 *
 * Utilisé uniquement en Expo Go (où react-native-track-player n'est pas disponible).
 * Fournit une lecture audio basique sans notification ni contrôles en arrière-plan.
 * NE PAS importer ce fichier directement — passer par GlobalAudioPlayer.tsx.
 */
import { useEffect, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlayerStore, useOfflineStore } from '../stores/index';
import { tracksAPI, getDynamicApiUrl } from '../lib/api';
import { rewriteUrl } from '../lib/url';
import { hapticFeedback } from '../lib/haptics';

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

export default function AudioPlayerFallback() {
  const { currentTrack, isPlaying, setProgress, nextTrack } = usePlayerStore();
  const soundRef = useRef<Audio.Sound | null>(null);
  const trackIdRef = useRef<string | null>(null);

  // Configure audio mode once
  useEffect(() => {
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

  // Load + play when track changes
  useEffect(() => {
    if (!currentTrack) {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      trackIdRef.current = null;
      return;
    }

    if (currentTrack.id === trackIdRef.current) return;
    trackIdRef.current = currentTrack.id;

    (async () => {
      // Stop previous
      if (soundRef.current) {
        try { await soundRef.current.stopAsync(); } catch {}
        try { await soundRef.current.unloadAsync(); } catch {}
        soundRef.current = null;
      }

      const uri = await resolveUri(currentTrack);
      if (!uri) { usePlayerStore.getState().clearPlayer(); return; }

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          (status) => {
            if (status.isLoaded) {
              setProgress(
                status.positionMillis / 1000,
                (status.durationMillis || 0) / 1000
              );
              if (status.didJustFinish) nextTrack();
            }
          },
          false
        );
        soundRef.current = sound;
        tracksAPI.play(currentTrack.id).catch(() => {});
        hapticFeedback.medium().catch(() => {});
      } catch (err) {
        console.error('[AudioPlayerFallback] Error:', err);
        hapticFeedback.error().catch(() => {});
      }
    })();
  }, [currentTrack?.id]);

  // Sync play/pause
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

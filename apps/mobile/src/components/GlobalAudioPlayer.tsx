import React, { useEffect } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlayerStore, useOfflineStore } from '../stores/index';
import { tracksAPI, getDynamicApiUrl } from '../lib/api';
import { rewriteUrl } from '../lib/url';
import { hapticFeedback } from '../lib/haptics';

const API_URL = getDynamicApiUrl();

// ── Global Singleton Sound Engine ─────────────────────────────────────────────
// Prevents duplicate playback instances and race conditions across component mounts.
let globalSound: Audio.Sound | null = null;
let currentPlayingTrackId: string | null = null;
let activeSessionId = 0;
let isConfiguringAudioMode = false;

async function setupAudioMode() {
  if (isConfiguringAudioMode) return;
  isConfiguringAudioMode = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  } catch (err) {
    console.warn('[GlobalAudioPlayer] Erreur configuration audio mode:', err);
  }
}

export default function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, setProgress, nextTrack } = usePlayerStore();

  useEffect(() => {
    setupAudioMode();
  }, []);

  // Track change handler with session fencing
  useEffect(() => {
    let cancelled = false;
    const sessionId = ++activeSessionId;

    const loadAndPlayTrack = async () => {
      // 1. If no track selected, stop and clean up everything
      if (!currentTrack) {
        currentPlayingTrackId = null;
        if (globalSound) {
          const soundToUnload = globalSound;
          globalSound = null;
          try {
            await soundToUnload.stopAsync();
            await soundToUnload.unloadAsync();
          } catch {}
        }
        return;
      }

      // 2. Avoid reloading if already playing this exact track
      if (currentTrack.id === currentPlayingTrackId && globalSound) {
        return;
      }

      console.log(`[GlobalAudioPlayer] Session #${sessionId} - Changement de morceau vers: ${currentTrack.id}`);

      // 3. Immediately stop & unload previous sound before creating new one
      if (globalSound) {
        const soundToUnload = globalSound;
        globalSound = null;
        try {
          await soundToUnload.stopAsync();
          await soundToUnload.unloadAsync();
        } catch {}
      }

      if (cancelled || sessionId !== activeSessionId) return;

      try {
        // Resolve audio URI (offline first, then remote)
        const offlineItem = useOfflineStore.getState().downloads[currentTrack.id];
        const rawAudioUrl = currentTrack.audioUrl || '';
        let uri = (offlineItem && offlineItem.localFileUri)
          ? offlineItem.localFileUri
          : (rawAudioUrl.startsWith('http') 
            ? rawAudioUrl 
            : rawAudioUrl 
              ? `${API_URL}${rawAudioUrl}`
              : '');

        if (!uri) {
          console.warn('[GlobalAudioPlayer] Aucune URL audio valide pour le morceau:', currentTrack.id);
          usePlayerStore.getState().clearPlayer();
          return;
        }

        // Validate local file URI exists
        if (uri.startsWith('file://')) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists) {
            console.warn('[GlobalAudioPlayer] Le fichier hors-ligne est introuvable sur le disque:', uri);
            if (rawAudioUrl && !rawAudioUrl.startsWith('file://')) {
              uri = rawAudioUrl.startsWith('http') ? rawAudioUrl : `${API_URL}${rawAudioUrl}`;
            } else {
              usePlayerStore.getState().clearPlayer();
              return;
            }
          }
        }

        uri = rewriteUrl(uri);
        console.log('[GlobalAudioPlayer] Chargement du son URI:', uri);

        if (cancelled || sessionId !== activeSessionId) return;

        // Create sound instance
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          {
            shouldPlay: true,
            progressUpdateIntervalMillis: 250,
          },
          (status) => {
            if (status.isLoaded) {
              setProgress(status.positionMillis / 1000, (status.durationMillis || 0) / 1000);
              if (status.didJustFinish) {
                nextTrack();
              }
            }
          },
          false // Progressive streaming
        );

        // If another track was requested while loading, abort this instance
        if (cancelled || sessionId !== activeSessionId) {
          sound.stopAsync().catch(() => {}).then(() => sound.unloadAsync().catch(() => {}));
          return;
        }

        globalSound = sound;
        currentPlayingTrackId = currentTrack.id;
        hapticFeedback.medium().catch(() => {});

        // Track play counter
        tracksAPI.play(currentTrack.id).catch(() => {});
      } catch (error) {
        console.error('[GlobalAudioPlayer] Erreur lors du chargement du morceau:', error);
        currentPlayingTrackId = null;
        hapticFeedback.error().catch(() => {});
      }
    };

    loadAndPlayTrack();

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  // Play / Pause toggle handler
  useEffect(() => {
    const syncPlayPause = async () => {
      if (!globalSound) return;
      try {
        const status = await globalSound.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying && !status.isPlaying) {
            await globalSound.playAsync();
          } else if (!isPlaying && status.isPlaying) {
            await globalSound.pauseAsync();
          }
        }
      } catch {}
    };

    syncPlayPause();
  }, [isPlaying]);

  return null;
}

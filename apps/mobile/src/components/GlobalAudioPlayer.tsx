import React, { useEffect, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlayerStore, useOfflineStore } from '../stores/index';
import { tracksAPI, getDynamicApiUrl } from '../lib/api';
import Constants from 'expo-constants';
import { rewriteUrl } from '../lib/url';
import { hapticFeedback } from '../lib/haptics';

const API_URL = getDynamicApiUrl();

export default function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, setProgress, nextTrack } = usePlayerStore();
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    // Configure audio system for background playback
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    }).catch(console.error);
  }, []);

  // Track change handler
  useEffect(() => {
    let cancelled = false;

    const loadNewTrack = async () => {
      if (!currentTrack) {
        if (soundRef.current) {
          try {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
          } catch (e) {}
          soundRef.current = null;
          currentTrackIdRef.current = null;
        }
        return;
      }

      // If the track ID has actually changed
      if (currentTrack.id !== currentTrackIdRef.current) {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;

        // Unload existing sound safely before loading new one
        if (soundRef.current) {
          const oldSound = soundRef.current;
          soundRef.current = null;
          try {
            await oldSound.stopAsync();
            await oldSound.unloadAsync();
          } catch (e) {}
        }

        try {
          // Check if we have the track downloaded offline
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
            console.warn("GlobalAudioPlayer - No valid audio URL found for track:", currentTrack.id);
            usePlayerStore.getState().clearPlayer();
            isSyncingRef.current = false;
            return;
          }

          // Validate if local file URI actually exists on disk
          if (uri.startsWith('file://')) {
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (!fileInfo.exists) {
              console.warn("GlobalAudioPlayer - Downloaded file no longer exists on disk:", uri);
              if (rawAudioUrl && !rawAudioUrl.startsWith('file://')) {
                uri = rawAudioUrl.startsWith('http') ? rawAudioUrl : `${API_URL}${rawAudioUrl}`;
              } else {
                console.warn("GlobalAudioPlayer - No remote fallback URL available, stopping player.");
                usePlayerStore.getState().clearPlayer();
                isSyncingRef.current = false;
                return;
              }
            }
          }

          // Rewrite private/localhost IPs to current API_URL host if needed for physical devices
          uri = rewriteUrl(uri);

          console.log("GlobalAudioPlayer - Loading sound URI:", uri);

          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: isPlaying },
            (status) => {
              if (status.isLoaded) {
                setProgress(status.positionMillis / 1000, (status.durationMillis || 0) / 1000);
                if (status.didJustFinish) {
                  nextTrack();
                }
              }
            }
          );

          if (cancelled) {
            await sound.stopAsync();
            await sound.unloadAsync();
            isSyncingRef.current = false;
            return;
          }

          soundRef.current = sound;
          currentTrackIdRef.current = currentTrack.id;
          hapticFeedback.medium().catch(() => {});

          if (isPlaying) {
            tracksAPI.play(currentTrack.id).catch(() => {});
          }
        } catch (error) {
          console.error("Error loading track:", error);
          currentTrackIdRef.current = null;
          hapticFeedback.error().catch(() => {});
        } finally {
          isSyncingRef.current = false;
        }
      }
    };

    loadNewTrack();

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]); // Only trigger when track ID changes

  // Play / Pause toggle handler for current track
  useEffect(() => {
    const handlePlayPauseToggle = async () => {
      if (!soundRef.current || isSyncingRef.current) return;
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying && !status.isPlaying) {
            await soundRef.current.playAsync();
          } else if (!isPlaying && status.isPlaying) {
            await soundRef.current.pauseAsync();
          }
        }
      } catch (e) {}
    };

    handlePlayPauseToggle();
  }, [isPlaying]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  return null;
}

/**
 * TrackPlayer Background Service
 *
 * Ce fichier DOIT être enregistré comme service de lecture en arrière-plan
 * via TrackPlayer.registerPlaybackService() dans le point d'entrée.
 *
 * Il écoute les remote events (notification du lecteur, écran de verrouillage,
 * boutons Bluetooth, écouteurs) et met à jour le state Zustand en conséquence.
 */

import TrackPlayer, { Event } from 'react-native-track-player';

export async function PlaybackService() {
  // Lecture / Pause
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  // Piste suivante
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext().catch(() => {});
  });

  // Piste précédente
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious().catch(() => {});
  });

  // Seek (avancer/reculer dans la piste)
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    TrackPlayer.seekTo(position);
  });

  // Stop (bouton stop sur certains appareils Android)
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });
}

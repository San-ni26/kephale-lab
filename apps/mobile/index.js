/**
 * Entry point — TrackPlayer service registration
 *
 * IMPORTANT: registerPlaybackService doit être appelé AVANT tout React.
 * On utilise uniquement require() (pas import) pour contrôler l'ordre d'exécution.
 */

// Enregistrement du service TrackPlayer (ignoré en Expo Go car le module natif n'existe pas)
try {
  const TrackPlayer = require('react-native-track-player').default;
  const { PlaybackService } = require('./src/lib/trackPlayerService');
  TrackPlayer.registerPlaybackService(() => PlaybackService);
} catch (e) {
  // Silencieux en Expo Go — le module natif n'est pas disponible
}

// Point d'entrée Expo Router
require('expo-router/entry');

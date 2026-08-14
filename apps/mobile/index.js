/**
 * Entry point — TrackPlayer service registration
 *
 * react-native-track-player exige que registerPlaybackService() soit appelé
 * AVANT tout autre code React dans les builds natifs.
 *
 * En Expo Go : le module natif n'existe pas → on skip le register silencieusement.
 * En Dev Build / Production : on enregistre le service de lecture en arrière-plan.
 */

// Détecte Expo Go avant même d'importer TrackPlayer
const isExpoGo = typeof global.__ExpoGo !== 'undefined' || (() => {
  try {
    // expo-constants is synchronous
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    return Constants.appOwnership === 'expo';
  } catch {
    return false;
  }
})();

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TrackPlayer = require('react-native-track-player').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PlaybackService } = require('./src/lib/trackPlayerService');
    TrackPlayer.registerPlaybackService(() => PlaybackService);
  } catch (e) {
    console.warn('[index.js] TrackPlayer registerPlaybackService failed (expected in Expo Go):', e);
  }
}

// Déléguer à expo-router comme d'habitude
import 'expo-router/entry';

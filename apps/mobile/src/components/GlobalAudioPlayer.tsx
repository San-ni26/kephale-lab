/**
 * GlobalAudioPlayer — Sélecteur d'engine audio
 *
 * Choisit le bon composant au niveau MODULE (une fois au chargement),
 * et non à l'intérieur d'une fonction React — ce qui garantit que
 * les hooks de chaque composant sont toujours appelés au même niveau.
 *
 * Expo Go → AudioPlayerFallback (expo-av, pas de bg controls)
 * Build   → AudioPlayerNative  (react-native-track-player, bg controls complets)
 */
import React from 'react';
import Constants from 'expo-constants';


const isExpoGo = Constants.appOwnership === 'expo';

// Sélection au niveau module : seul le bon fichier est chargé dans le bundle.
// En Expo Go, AudioPlayerNative (et react-native-track-player) ne sont JAMAIS importés.
const GlobalAudioPlayer: React.ComponentType = isExpoGo
  ? require('./AudioPlayerFallback').default
  : require('./AudioPlayerNative').default;

export default GlobalAudioPlayer;

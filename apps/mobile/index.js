/**
 * Entry point — TrackPlayer service registration
 *
 * react-native-track-player exige que registerPlaybackService() soit appelé
 * AVANT tout autre code React, directement dans le point d'entrée de l'app.
 * C'est pourquoi nous remplaçons "main": "expo-router/entry" par ce fichier,
 * qui enregistre le service puis délègue à expo-router/entry.
 */
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './src/lib/trackPlayerService';

TrackPlayer.registerPlaybackService(() => PlaybackService);

// Déléguer à expo-router comme d'habitude
import 'expo-router/entry';

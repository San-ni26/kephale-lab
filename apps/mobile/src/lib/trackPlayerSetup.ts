/**
 * TrackPlayer Setup — Singleton global
 *
 * setupTrackPlayer() doit être appelé une seule fois au démarrage.
 * Un flag module-level garantit qu'un double-appel est no-op.
 */
import TrackPlayer, { Capability } from 'react-native-track-player';

let setupPromise: Promise<void> | null = null;

export function ensureTrackPlayerSetup(): Promise<void> {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer({
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
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],
      });
    } catch (err) {
      // setupPlayer throws if called a second time — that's OK, we can ignore it
      console.warn('[TrackPlayerSetup] setupPlayer error (may be harmless):', err);
    }
  })();

  return setupPromise;
}

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Universal Haptic Feedback utility for Kephale
 * Provides tactile feedback on actions (likes, purchases, playback, errors)
 */
export const hapticFeedback = {
  /**
   * Light tap — for minor UI interactions, tab changes, button presses
   */
  light: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  },

  /**
   * Medium tap — for likes, adds to playlist, play/pause
   */
  medium: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  },

  /**
   * Heavy tap — for key actions, uploads, deletions
   */
  heavy: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  },

  /**
   * Success notification — for token purchase, follow, withdrawal success
   */
  success: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  },

  /**
   * Warning notification — for alerts, confirmation prompts
   */
  warning: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
  },

  /**
   * Error notification — for validation failures, network errors
   */
  error: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  },

  /**
   * Selection change — for sliders, picker scroll
   */
  selection: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.selectionAsync();
    } catch {}
  },
};

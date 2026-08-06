import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

/**
 * Helper to request and verify Media Library (Gallery) permission with user prompt & settings redirect
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  try {
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (!permission.granted && permission.canAskAgain) {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (permission.granted) {
      return true;
    }

    Alert.alert(
      'Accès à la galerie requis',
      'Pour joindre des photos ou vidéos, veuillez autoriser l\'accès à la galerie dans les réglages de votre appareil.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir les Réglages',
          onPress: () => Linking.openSettings().catch(() => {}),
        },
      ]
    );
    return false;
  } catch (error) {
    console.warn('[Permissions] Error checking media library permission:', error);
    return false;
  }
}

/**
 * Helper to request and verify Camera permission with user prompt & settings redirect
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    let permission = await ImagePicker.getCameraPermissionsAsync();

    if (!permission.granted && permission.canAskAgain) {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    }

    if (permission.granted) {
      return true;
    }

    Alert.alert(
      'Accès à la caméra requis',
      'Pour prendre une photo ou filmer directement, veuillez autoriser l\'accès à la caméra dans les réglages de votre appareil.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir les Réglages',
          onPress: () => Linking.openSettings().catch(() => {}),
        },
      ]
    );
    return false;
  } catch (error) {
    console.warn('[Permissions] Error checking camera permission:', error);
    return false;
  }
}

/**
 * Helper to request and verify Microphone permission with user prompt & settings redirect
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    let permission = await Audio.getPermissionsAsync();

    if (!permission.granted && permission.canAskAgain) {
      permission = await Audio.requestPermissionsAsync();
    }

    if (permission.granted) {
      return true;
    }

    Alert.alert(
      'Microphone requis',
      'Pour enregistrer et envoyer des notes vocales dans vos discussions, veuillez autoriser l\'accès au microphone dans les réglages de votre appareil.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir les Réglages',
          onPress: () => Linking.openSettings().catch(() => {}),
        },
      ]
    );
    return false;
  } catch (error) {
    console.warn('[Permissions] Error checking microphone permission:', error);
    return false;
  }
}

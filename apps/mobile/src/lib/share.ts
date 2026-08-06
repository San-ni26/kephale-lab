import { Share, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { hapticFeedback } from './haptics';

const BASE_WEB_URL = 'https://kephale.app';
const SCHEME = 'kephale';

export type ShareType = 'track' | 'artist' | 'reel' | 'album' | 'playlist';

/**
 * Generate universal deep link for Kephale content
 */
export function generateDeepLink(type: ShareType, id: string): string {
  // Mobile deep link (e.g. kephale://track/cm123)
  return Linking.createURL(`/${type}/${id}`, { scheme: SCHEME });
}

/**
 * Generate public web preview URL
 */
export function generateWebUrl(type: ShareType, id: string): string {
  return `${BASE_WEB_URL}/${type}/${id}`;
}

/**
 * Share a track across WhatsApp, Instagram, Telegram, SMS, etc.
 */
export async function shareTrack(track: {
  id: string;
  title: string;
  artistName?: string;
  coverUrl?: string;
}): Promise<boolean> {
  await hapticFeedback.light();

  const webUrl = generateWebUrl('track', track.id);
  const artistText = track.artistName ? ` de ${track.artistName}` : '';
  const message = Platform.select({
    ios: `Écoute "${track.title}"${artistText} sur Kephale`,
    default: `Écoute "${track.title}"${artistText} sur Kephale\n${webUrl}`,
  });

  try {
    const result = await Share.share({
      title: `${track.title}${artistText}`,
      message,
      url: webUrl, // iOS uses url field
    });

    if (result.action === Share.sharedAction) {
      await hapticFeedback.success();
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[Share] Error sharing track:', error);
    return false;
  }
}

/**
 * Share an artist profile
 */
export async function shareArtist(artist: {
  id: string;
  stageName: string;
}): Promise<boolean> {
  await hapticFeedback.light();

  const webUrl = generateWebUrl('artist', artist.id);
  const message = Platform.select({
    ios: `Découvre le profil de ${artist.stageName} sur Kephale`,
    default: `Découvre le profil de ${artist.stageName} sur Kephale\n${webUrl}`,
  });

  try {
    const result = await Share.share({
      title: artist.stageName,
      message,
      url: webUrl,
    });
    return result.action === Share.sharedAction;
  } catch (error) {
    console.warn('[Share] Error sharing artist:', error);
    return false;
  }
}

/**
 * Share a video Reel
 */
export async function shareReel(reel: {
  id: string;
  title?: string;
  creatorName?: string;
}): Promise<boolean> {
  await hapticFeedback.light();

  const webUrl = generateWebUrl('reel', reel.id);
  const title = reel.title || 'Reel Kephale';
  const creator = reel.creatorName ? ` par ${reel.creatorName}` : '';
  const message = Platform.select({
    ios: `Regarde "${title}"${creator} sur Kephale`,
    default: `Regarde "${title}"${creator} sur Kephale\n${webUrl}`,
  });

  try {
    const result = await Share.share({
      title,
      message,
      url: webUrl,
    });
    return result.action === Share.sharedAction;
  } catch (error) {
    console.warn('[Share] Error sharing reel:', error);
    return false;
  }
}

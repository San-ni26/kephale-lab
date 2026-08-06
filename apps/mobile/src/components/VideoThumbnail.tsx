import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons, Feather } from '@expo/vector-icons';

interface VideoThumbnailProps {
  sourceUrl?: string | null;
  videoUrl?: string | null; // Only used to generate thumbnail if local (file://) and sourceUrl is empty
  style?: StyleProp<ImageStyle | ViewStyle>;
  fallbackIcon?: keyof typeof Feather.glyphMap;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  blurRadius?: number;
}

const thumbnailMemoryCache = new Map<string, string>();

// Limit concurrent thumbnail extractions to prevent network clogging
let activeExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const extractionQueue: Array<() => void> = [];

function processNextExtraction() {
  if (activeExtractions < MAX_CONCURRENT_EXTRACTIONS && extractionQueue.length > 0) {
    activeExtractions++;
    const next = extractionQueue.shift();
    next?.();
  }
}

export function VideoThumbnail({ 
  sourceUrl, 
  videoUrl, 
  style, 
  fallbackIcon = 'video',
  resizeMode = 'cover',
  blurRadius
}: VideoThumbnailProps) {
  const cached = videoUrl ? thumbnailMemoryCache.get(videoUrl) : null;
  const [generatedUri, setGeneratedUri] = useState<string | null>(cached || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!sourceUrl && videoUrl && !generatedUri && !error) {
      if (thumbnailMemoryCache.has(videoUrl)) {
        setGeneratedUri(thumbnailMemoryCache.get(videoUrl)!);
        return;
      }

      setLoading(true);

      const runExtraction = async () => {
        try {
          // Timeout after 6s to never hang
          const extractionPromise = VideoThumbnails.getThumbnailAsync(videoUrl, {
            time: 0,
            quality: 0.5,
          });

          const timeoutPromise = new Promise<{ uri: string }>((_, reject) =>
            setTimeout(() => reject(new Error('Thumbnail timeout')), 6000)
          );

          const { uri } = await Promise.race([extractionPromise, timeoutPromise]);

          if (uri) {
            thumbnailMemoryCache.set(videoUrl, uri);
          }
          if (isMounted) {
            setGeneratedUri(uri);
            setLoading(false);
          }
        } catch {
          if (isMounted) {
            setError(true);
            setLoading(false);
          }
        } finally {
          activeExtractions--;
          processNextExtraction();
        }
      };

      if (activeExtractions < MAX_CONCURRENT_EXTRACTIONS) {
        activeExtractions++;
        runExtraction();
      } else {
        extractionQueue.push(runExtraction);
      }
    }
    return () => { isMounted = false; };
  }, [sourceUrl, videoUrl, generatedUri, error]);

  const finalUri = sourceUrl || generatedUri;

  if (finalUri && !error) {
    return (
      <Image 
        source={{ uri: finalUri }} 
        style={style as any} 
        contentFit={resizeMode as any}
        blurRadius={blurRadius}
        cachePolicy="memory-disk"
        transition={200}
        onError={() => setError(true)}
      />
    );
  }

  if (loading) {
    return (
      <View style={[style as any, styles.fallbackContainer]}>
        <ActivityIndicator size="small" color="#FF5A00" />
      </View>
    );
  }

  return (
    <View style={[style as any, styles.fallbackContainer]}>
      <Ionicons name="film-outline" size={24} color="#666" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});

export default VideoThumbnail;



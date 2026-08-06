import React, { useState, useEffect, useMemo } from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

export const AudioPlayer = ({ uri }: { uri: string }) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const playSound = async () => {
    try {
      if (sound) {
        if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
        else { await sound.playAsync(); setIsPlaying(true); }
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        setSound(newSound);
        setIsPlaying(true);
        newSound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.isLoaded) {
            setDuration(status.durationMillis || 0);
            setPosition(status.positionMillis || 0);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPosition(0);
            }
          }
        });
      }
    } catch (e) {
      console.warn('[AudioPlayer] Playback error:', e);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // Simulate a static waveform for visuals
  const heights = useMemo(() => Array.from({ length: 20 }).map(() => 6 + Math.random() * 14), []);
  const waveform = heights.map((h, i) => (
    <View key={i} style={[styles.waveBar, { height: h, opacity: (position / duration) > (i / 20) ? 1 : 0.4 }]} />
  ));

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={playSound} style={styles.playBtn}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.waveContainer}>
        {waveform}
      </View>
      <Text style={styles.timeText}>
        {duration > 0 ? formatTime(position) : "Audio"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 8,
    paddingRight: 16,
    width: 200,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF5A00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  waveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
    marginRight: 12,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  }
});

export default AudioPlayer;

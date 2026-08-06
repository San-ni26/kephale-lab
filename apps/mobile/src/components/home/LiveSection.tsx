import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

const LiveCard = ({ live }: { live: any }) => {
  const [timeLeft, setTimeLeft] = React.useState<string>('');

  React.useEffect(() => {
    if (live.status !== 'SCHEDULED' || !live.scheduledAt) return;
    
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const scheduled = new Date(live.scheduledAt).getTime();
      const diff = scheduled - now;
      
      if (diff <= 0) {
        setTimeLeft('Imminent');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 24) {
        setTimeLeft(`Dans ${Math.floor(hours/24)}j`);
      } else if (hours > 0) {
        setTimeLeft(`Dans ${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`Dans ${minutes}m`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 60000); // update every minute
    return () => clearInterval(timer);
  }, [live.scheduledAt, live.status]);

  const isLive = live.status === 'LIVE';

  return (
    <TouchableOpacity
      style={[styles.liveCard, !isLive && styles.scheduledCard]}
      onPress={() => router.push(`/live/${live.id}`)}
    >
      <View style={[styles.liveBadge, !isLive && styles.scheduledBadge]}>
        <Text style={styles.liveBadgeText}>{isLive ? 'EN DIRECT' : timeLeft || 'PROGRAMMÉ'}</Text>
      </View>
      <View style={styles.liveInfo}>
        <Text style={styles.liveTitle} numberOfLines={1}>{live.title}</Text>
        <Text style={styles.liveArtist}>{live.artist?.stageName}</Text>
        <Text style={styles.liveViewers}>{isLive ? `${live.viewerCount} spectateurs` : 'À venir'}</Text>
      </View>
    </TouchableOpacity>
  );
};

export default function LiveSection({ lives }: { lives: any[] }) {
  if (!lives || lives.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>En Direct & À Venir</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {lives.map((live: any) => (
          <LiveCard key={live.id} live={live} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, color: '#FFFFFF', fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  liveCard: {
    width: 180,
    height: 120,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginLeft: 20,
    padding: 12,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FF5A00',
  },
  liveBadge: {
    backgroundColor: '#FF5A00',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  scheduledBadge: {
    backgroundColor: '#3B82F6',
  },
  scheduledCard: {
    borderColor: '#3B82F6',
    opacity: 0.9,
  },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  liveInfo: {},
  liveTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  liveArtist: { color: '#A0A0A0', fontSize: 11, marginTop: 2 },
  liveViewers: { color: '#A0A0A0', fontSize: 11, marginTop: 4 },
});

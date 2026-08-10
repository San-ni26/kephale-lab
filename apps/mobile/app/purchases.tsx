import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { userAPI } from '../src/lib/api';
import { useAuthStore, usePlayerStore } from '../src/stores';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PurchasesScreen() {
  const { user } = useAuthStore();
  const { setTrack } = usePlayerStore();

  const { data: purchasesData, isLoading } = useQuery({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      const res = await userAPI.getPurchases();
      return res.data.data;
    },
  });

  const purchases = (purchasesData || []).filter((p: any) => {
    if (p.type === 'TRACK' && !p.track) return false;
    if (p.type === 'ALBUM' && !p.album) return false;
    if (p.type === 'CLIP' && !p.video) return false;
    return true;
  });

  const handlePress = (purchase: any) => {
    if (purchase.type === 'TRACK' && purchase.track) {
      setTrack(purchase.track, [purchase.track]);
    } else if (purchase.type === 'ALBUM' && purchase.albumId) {
      router.push(`/album/${purchase.albumId}`);
    } else if (purchase.type === 'CLIP' && purchase.videoId) {
      router.push(`/clip/${purchase.videoId}`);
    }
  };

  const renderItem = (purchase: any) => {
    let title = 'Inconnu';
    let subtitle = '';
    let image = null;
    let icon = 'musical-notes';

    if (purchase.type === 'TRACK' && purchase.track) {
      title = purchase.track.title;
      subtitle = purchase.track.artist?.stageName || '';
      image = purchase.track.coverUrl || purchase.track.album?.coverUrl;
      icon = 'musical-note';
    } else if (purchase.type === 'ALBUM' && purchase.album) {
      title = purchase.album.title;
      subtitle = purchase.album.artist?.stageName || '';
      image = purchase.album.coverUrl;
      icon = 'disc';
    } else if (purchase.type === 'CLIP' && purchase.video) {
      title = purchase.video.title;
      subtitle = purchase.video.artist?.stageName || '';
      image = purchase.video.thumbnailUrl;
      icon = 'videocam';
    } else if (purchase.type === 'TOKEN_PACK') {
      title = 'Pack de Jetons';
      subtitle = 'Recharge de solde';
      icon = 'wallet-outline';
    }

    const dateStr = format(new Date(purchase.createdAt), 'dd MMM yyyy', { locale: fr });

    return (
      <TouchableOpacity 
        key={purchase.id} 
        style={styles.card}
        onPress={() => handlePress(purchase)}
      >
        <View style={styles.cardLeft}>
          {image ? (
            <Image 
              source={{ uri: image }} 
              style={styles.image} 
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name={icon as any} size={24} color="#555" />
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.price}>
            {purchase.currency === 'TOKEN' ? `${purchase.amount} Jetons` : `${purchase.amount} ${purchase.currency}`}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{purchase.type}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Achats</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          {purchases.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cart-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>Aucun achat</Text>
              <Text style={styles.emptyText}>Vous n'avez pas encore effectué d'achats sur l'application.</Text>
            </View>
          ) : (
            purchases.map(renderItem)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backBtn: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1A1A1A', borderRadius: 20,
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptyText: { color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },

  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  image: {
    width: 60, height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  imagePlaceholder: {
    width: 60, height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  title: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  subtitle: { color: '#AAA', fontSize: 13, marginBottom: 4 },
  date: { color: '#666', fontSize: 11 },
  
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 12,
  },
  price: { color: '#FF5A00', fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  badge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
});

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { artistsAPI } from '../../src/lib/api';

export default function StudioSalesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['artist-sales'],
    queryFn: () => artistsAPI.getSales(),
  });

  const sales = (data?.data?.data || []).filter((item: any) => {
    if (!item.track && !item.album && !item.video) return false;
    return true;
  });

  const renderSaleItem = ({ item }: { item: any }) => {
    const isTrack = !!item.track;
    const isAlbum = !!item.album;
    const isVideo = !!item.video;
    
    let title = 'Inconnu';
    let typeLabel = '';
    let coverUrl = '';

    if (isTrack) {
      title = item.track.title;
      typeLabel = 'Morceau';
      coverUrl = item.track.coverUrl;
    } else if (isAlbum) {
      title = item.album.title;
      typeLabel = 'Album';
      coverUrl = item.album.coverUrl;
    } else if (isVideo) {
      title = item.video.title;
      typeLabel = 'Vidéo';
      coverUrl = item.video.thumbnailUrl;
    }

    const buyerName = item.user?.name || 'Utilisateur inconnu';
    const buyerAvatar = item.user?.avatar;

    return (
      <View style={styles.saleCard}>
        <View style={styles.saleHeader}>
          <View style={styles.buyerInfo}>
            {buyerAvatar ? (
              <Image source={{ uri: buyerAvatar }} style={styles.buyerAvatar} />
            ) : (
              <View style={[styles.buyerAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={14} color="#FFF" />
              </View>
            )}
            <Text style={styles.buyerName} numberOfLines={1}>{buyerName}</Text>
          </View>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>

        <View style={styles.itemInfoRow}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.itemCover} />
          ) : (
            <View style={[styles.itemCover, styles.coverPlaceholder]}>
              <Ionicons name="musical-notes" size={20} color="#666" />
            </View>
          )}
          <View style={styles.itemDetails}>
            <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.itemType}>{typeLabel}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.artistAmount}>+{item.artistAmount} {item.currency}</Text>
            <Text style={styles.totalAmount}>Prix: {item.amount} {item.currency}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique des Ventes</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : sales.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cart-outline" size={60} color="#444" />
          <Text style={styles.emptyText}>Aucune vente pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={renderSaleItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  
  listContent: { padding: 16 },
  saleCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  buyerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  buyerAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  avatarPlaceholder: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  buyerName: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  date: { color: '#888', fontSize: 12 },
  
  itemInfoRow: { flexDirection: 'row', alignItems: 'center' },
  itemCover: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
  coverPlaceholder: { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  itemDetails: { flex: 1 },
  itemTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  itemType: { color: '#10B981', fontSize: 12, fontWeight: '500' },
  
  priceContainer: { alignItems: 'flex-end' },
  artistAmount: { color: '#10B981', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  totalAmount: { color: '#888', fontSize: 11 },
  
  emptyText: { color: '#888', fontSize: 16, marginTop: 16 },
});

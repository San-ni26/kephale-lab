import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { chatAPI } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores';
import ContactsModal from '../../src/components/ContactsModal';
import { getGlobalSocket } from '../../src/lib/socket';

export default function MessagesScreen() {
  const { user, isAuthenticated } = useAuthStore();
  const [showContacts, setShowContacts] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatAPI.getConversations(),
    enabled: isAuthenticated,
  });

  React.useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket || !isAuthenticated) return;

    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('user:update', handleUpdate);

    return () => {
      socket.off('user:update', handleUpdate);
    };
  }, [isAuthenticated, queryClient]);

  const conversations = conversationsData?.data?.data || [];

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.text}>Connectez-vous pour voir vos messages.</Text>
          <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(auth)/welcome' as any)}>
            <Text style={styles.loginText}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: any }) => {
    const isUser1 = item.user1Id === user?.id;
    const otherUser = isUser1 ? item.user2 : item.user1;
    const lastMessage = item.messages?.[0];

    const isPending = item.status === 'PENDING';
    const amIReceiver = item.status === 'PENDING' && item.user2Id === user?.id;

    const handleLongPress = () => {
      Alert.alert(
        'Supprimer la discussion',
        `Voulez-vous supprimer la discussion avec ${otherUser?.name || 'cet utilisateur'} ? (L'historique sera effacé de votre côté).`,
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Supprimer', 
            style: 'destructive',
            onPress: async () => {
              try {
                await chatAPI.deleteConversation(item.id);
                await queryClient.invalidateQueries({ queryKey: ['conversations'] });
              } catch (e) {
                Alert.alert('Erreur', 'Impossible de supprimer la discussion.');
              }
            }
          }
        ]
      );
    };

    return (
      <TouchableOpacity 
        style={styles.conversationItem} 
        onPress={() => router.push(`/chat/${item.id}`)}
        onLongPress={handleLongPress}
      >
        <Image 
          source={{ uri: otherUser?.avatar || 'https://via.placeholder.com/50' }} 
          style={styles.avatar} 
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
        />
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.userName} numberOfLines={1}>{otherUser?.name || 'Utilisateur'}</Text>
              {otherUser?.username && (
                <Text style={styles.usernameText}>
                  {otherUser.username.startsWith('@') ? otherUser.username : `@${otherUser.username}`}
                </Text>
              )}
            </View>
            {lastMessage && (
              <Text style={styles.timeText}>
                {new Date(lastMessage.createdAt).toLocaleDateString()}
              </Text>
            )}
          </View>
          
          <View style={styles.messageRow}>
            <Text 
              style={[
                styles.lastMessage, 
                isPending && styles.pendingMessage,
                item.unreadCount > 0 && styles.unreadMessageText
              ]} 
              numberOfLines={1}
            >
              {amIReceiver ? "Nouvelle demande de message" : (lastMessage?.content || "Demande en attente")}
            </Text>
            {isPending && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>En attente</Text>
              </View>
            )}
            {!isPending && item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.newChatBtn} onPress={() => setShowContacts(true)}>
            <Ionicons name="person-add-outline" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.newChatBtn} onPress={() => router.push('/search-users')}>
            <Ionicons name="create-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>Aucune discussion pour le moment.</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => router.push('/search-users')}>
            <Text style={styles.startBtnText}>Nouvelle discussion</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <ContactsModal 
        visible={showContacts} 
        onClose={() => setShowContacts(false)} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  newChatBtn: { padding: 8, backgroundColor: '#1A1A1A', borderRadius: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { color: '#FFF', fontSize: 16, marginBottom: 20 },
  loginBtn: { backgroundColor: '#FF5A00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  loginText: { color: '#FFF', fontWeight: '700' },
  emptyText: { color: '#888', fontSize: 16, marginTop: 16, marginBottom: 24 },
  startBtn: { backgroundColor: '#FF5A00', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startBtnText: { color: '#FFF', fontWeight: '600' },
  listContent: { paddingTop: 10, paddingBottom: 100 },
  conversationItem: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1A1A1A', marginRight: 16 },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  usernameText: { color: '#A0A0A0', fontSize: 13 },
  timeText: { color: '#888', fontSize: 12 },
  messageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMessage: { color: '#A0A0A0', fontSize: 14, flex: 1 },
  unreadMessageText: { color: '#FFF', fontWeight: 'bold' },
  pendingMessage: { color: '#FF5A00', fontWeight: '500' },
  badge: { backgroundColor: 'rgba(255, 90, 0, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  badgeText: { color: '#FF5A00', fontSize: 10, fontWeight: '700' },
  unreadBadge: { backgroundColor: '#FF5A00', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 8, minWidth: 20, alignItems: 'center' },
  unreadBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' }
});

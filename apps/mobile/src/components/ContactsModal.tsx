import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { userAPI, chatAPI } from '../lib/api';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

interface ContactsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ContactsModal({ visible, onClose }: ContactsModalProps) {
  const [loading, setLoading] = useState(false);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (visible) {
      loadContacts();
    }
  }, [visible]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Kephale a besoin d\'accès à vos contacts pour trouver vos amis.');
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      if (data.length > 0) {
        // Extract phone numbers
        const phoneNumbers = data
          .map(c => c.phoneNumbers?.[0]?.number)
          .filter(Boolean) as string[];

        // Keep unique numbers and format roughly
        const uniqueNumbers = Array.from(new Set(phoneNumbers.map(n => n.replace(/[\s\-()]/g, ''))));

        // Call our backend sync-contacts
        const res = await userAPI.syncContacts(uniqueNumbers);
        const appUsers = res.data?.data || [];

        // Build list: matched app users first, then raw contacts
        const matchedMap = new Map();
        appUsers.forEach((u: any) => matchedMap.set(u.phoneNumber, u));

        const finalContacts = data.map(c => {
          const rawNum = c.phoneNumbers?.[0]?.number || '';
          const num = rawNum.replace(/[\s\-()]/g, '');
          const matchedUser = matchedMap.get(num);
          
          return {
            id: c.id,
            name: c.name,
            rawNumber: rawNum,
            matchedUser: matchedUser
          };
        }).filter(c => c.rawNumber);

        // Sort: matched users at the top
        finalContacts.sort((a, b) => {
          if (!a || !b) return 0;
          if (a.matchedUser && !b.matchedUser) return -1;
          if (!a.matchedUser && b.matchedUser) return 1;
          
          const nameA = String(a.name || '').toLowerCase();
          const nameB = String(b.name || '').toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
        });

        // Deduplicate by name or phone
        const deduplicated = [];
        const seenNames = new Set();
        for (const c of finalContacts) {
          if (!seenNames.has(c.name)) {
            seenNames.add(c.name);
            deduplicated.push(c);
          }
        }

        setContactsList(deduplicated);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', 'Impossible de charger les contacts.');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (userId: string) => {
    // 1. Check if conversation already exists in cache
    const cachedConversations: any = queryClient.getQueryData(['conversations']);
    const existingConv = cachedConversations?.data?.data?.find((c: any) => c.user1Id === userId || c.user2Id === userId);

    if (existingConv) {
       onClose();
       router.push(`/chat/${existingConv.id}` as any);
       return;
    }

    // 2. If not, request a new conversation
    try {
      setLoading(true);
      const res = await chatAPI.requestConversation(userId, 'Salut ! Je t\'ai trouvé via mes contacts.');
      onClose();
      
      const convId = res.data?.data?.conversation?.id;
      if (convId) {
        router.push(`/chat/${convId}` as any);
      } else {
        Alert.alert('Demande envoyée', 'Votre demande de discussion a été envoyée.');
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error?.message || 'Impossible d\'initier la discussion.');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isAppUser = !!item.matchedUser;

    return (
      <TouchableOpacity 
        style={styles.contactItem}
        disabled={!isAppUser}
        onPress={() => isAppUser && startChat(item.matchedUser.id)}
      >
        {isAppUser && item.matchedUser.avatar ? (
          <Image 
            source={{ uri: item.matchedUser.avatar }} 
            style={styles.avatar} 
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{(item.name || '#').charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name || 'Inconnu'}</Text>
          <Text style={styles.contactNumber}>{item.rawNumber}</Text>
        </View>

        {isAppUser && (
          <View style={styles.appUserBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#FF5A00" />
            <Text style={styles.appUserText}>Kephale</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filteredContacts = contactsList.filter(c => 
    String(c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.rawNumber && c.rawNumber.includes(searchQuery))
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vos Contacts</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un contact..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF5A00" />
            <Text style={styles.loadingText}>Synchronisation des contacts...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="people-outline" size={64} color="#333" />
                <Text style={styles.emptyText}>Aucun contact trouvé.</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A'
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#A0A0A0', marginTop: 16 },
  emptyText: { color: '#888', marginTop: 16 },
  listContent: { paddingBottom: 40 },
  contactItem: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#111'
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 16 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center', marginRight: 16
  },
  avatarLetter: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  contactInfo: { flex: 1, justifyContent: 'center' },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  contactNumber: { color: '#888', fontSize: 13 },
  appUserBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  appUserText: { color: '#FF5A00', fontSize: 12, fontWeight: 'bold' },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userAPI, chatAPI } from '../src/lib/api';
import { useAuthStore } from '../src/stores';
// import useDebounce from '../src/hooks/useDebounce'; // Removed since we use simple timeout inline

export default function SearchUsersScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Simple debounce effect
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(handler);
  }, [query]);

  const { data: searchData, isLoading } = useQuery({
    queryKey: ['search-users', debouncedQuery],
    queryFn: () => userAPI.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const users = searchData?.data?.data || [];

  const [promptVisible, setPromptVisible] = useState(false);
  const [promptTarget, setPromptTarget] = useState<any>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptConfig, setPromptConfig] = useState({ title: '', subtitle: '' });
  const [sending, setSending] = useState(false);

  const handleStartChat = (targetUser: any) => {
    if (targetUser.id === user?.id) {
      return Alert.alert('Erreur', "Vous ne pouvez pas discuter avec vous-même.");
    }
    
    // Check if conversation already exists
    const cachedConversations: any = queryClient.getQueryData(['conversations']);
    const existingConv = cachedConversations?.data?.data?.find((c: any) => c.user1Id === targetUser.id || c.user2Id === targetUser.id);

    if (existingConv) {
       router.replace(`/chat/${existingConv.id}`);
       return;
    }

    const amIArtist = user?.role === 'ARTIST';
    const isTargetArtist = targetUser.artistProfile != null;

    let title = 'Nouvelle discussion';
    let promptMsg = 'Écrivez votre message de demande (il expirera dans 24H si non accepté) :';

    if (amIArtist && !isTargetArtist) {
      promptMsg = 'Écrivez votre premier message pour démarrer la discussion :';
    } else if (amIArtist && isTargetArtist) {
      promptMsg = 'Écrivez votre demande. L\'autre artiste verra qu\'il s\'agit d\'une demande d\'un confrère :';
    }
    
    setPromptTarget(targetUser);
    setPromptConfig({ title, subtitle: promptMsg });
    setPromptMessage('');
    setPromptVisible(true);
  };

  const submitPrompt = async () => {
    if (!promptMessage.trim() || !promptTarget) return;
    setSending(true);
    try {
      const amIArtist = user?.role === 'ARTIST';
      const isTargetArtist = promptTarget.artistProfile != null;
      let finalMsg = promptMessage;
      if (amIArtist && isTargetArtist) {
        finalMsg = `[Demande d'artiste - ${user?.name}] : ${promptMessage}`;
      }
      const res = await chatAPI.requestConversation(promptTarget.id, finalMsg);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setPromptVisible(false);
      const convId = res.data.data.conversation.id;
      router.replace(`/chat/${convId}`);
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.error?.message || "Impossible d'envoyer la demande.");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const displayName = item.artistProfile?.stageName || item.name;
    const displayAvatar = item.artistProfile?.avatar || item.avatar || 'https://via.placeholder.com/50';

    return (
      <TouchableOpacity style={styles.userCard} onPress={() => handleStartChat(item)}>
        <Image 
          source={{ uri: displayAvatar }} 
          style={styles.avatar} 
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{displayName}</Text>
          {item.username && (
            <Text style={styles.usernameText}>
              {item.username.startsWith('@') ? item.username : `@${item.username}`}
            </Text>
          )}
          {item.artistProfile ? (
            <Text style={styles.artistBadge}>Artiste</Text>
          ) : (
            <Text style={styles.userBadge}>Utilisateur</Text>
          )}
        </View>
        <Ionicons name="chatbubbles-outline" size={24} color="#FFF" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nouvelle discussion</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un artiste ou un utilisateur..."
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF5A00" />
        </View>
      ) : query.length < 2 ? (
        <View style={styles.center}>
          <Text style={styles.helpText}>Tapez au moins 2 caractères pour rechercher.</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.helpText}>Aucun compte trouvé.</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Custom Prompt Modal */}
      <Modal visible={promptVisible} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{promptConfig.title}</Text>
              <Text style={styles.modalSubtitle}>{promptConfig.subtitle}</Text>
              
              <TextInput
                style={styles.modalInput}
                placeholder="Votre message..."
                placeholderTextColor="#A0A0A0"
                value={promptMessage}
                onChangeText={setPromptMessage}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={submitPrompt}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPromptVisible(false)} disabled={sending}>
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSendBtn} onPress={submitPrompt} disabled={sending}>
                  {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSendText}>Envoyer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    marginLeft: 8,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  helpText: { color: '#888', fontSize: 15 },
  listContent: { padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#333', marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  usernameText: { color: '#A0A0A0', fontSize: 13, marginBottom: 4 },
  artistBadge: { color: '#FF5A00', fontSize: 12, fontWeight: '500' },
  userBadge: { color: '#888', fontSize: 12 },
  
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center', padding: 20
  },
  modalContent: {
    backgroundColor: '#1A1A1A', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#333',
  },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { color: '#A0A0A0', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalInput: {
    backgroundColor: '#2A2A2A', color: '#FFF', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 24,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, backgroundColor: '#2A2A2A', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#333',
  },
  modalCancelText: { color: '#CCC', fontSize: 16, fontWeight: '600' },
  modalSendBtn: {
    flex: 1, backgroundColor: '#FF5A00', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FF5A00',
  },
  modalSendText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

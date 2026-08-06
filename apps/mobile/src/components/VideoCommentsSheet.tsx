import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList, Modal, TouchableWithoutFeedback } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { videosAPI } from '../lib/api';
import { useAuthStore } from '../stores';
import { router } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

interface VideoCommentsSheetProps {
  videoId: string | null;
  sheetRef: any; // Not used anymore but kept for prop signature compatibility if needed
  onClose: () => void;
  visible?: boolean;
}

export default function VideoCommentsSheet({ videoId, onClose, visible }: VideoCommentsSheetProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['video-comments', videoId],
    queryFn: () => videosAPI.getComments(videoId!),
    enabled: !!videoId && visible,
  });

  const comments: Comment[] = data?.data?.data ?? [];

  const commentMutation = useMutation({
    mutationFn: (text: string) => videosAPI.comment(videoId!, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-comments', videoId] });
      queryClient.invalidateQueries({ queryKey: ['reels-feed'] });
      setContent('');
    },
  });

  const handlePost = () => {
    if (!user) {
      onClose();
      router.push('/(auth)/welcome');
      return;
    }
    if (!content.trim()) return;
    commentMutation.mutate(content.trim());
  };

  const renderItem = ({ item }: { item: Comment }) => (
    <View style={styles.commentRow}>
      <Image
        source={{ uri: item.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.user.name)}&background=random` }}
        style={styles.avatar}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={150}
      />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.userName}>{item.user.name}</Text>
          <Text style={styles.timeText}>
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: fr })}
          </Text>
        </View>
        <Text style={styles.commentText}>{item.content}</Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        
        <View style={styles.sheetContainer}>
          <View style={styles.handleIndicator} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Commentaires</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#06B6D4" />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Soyez le premier à commenter !</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item: Comment) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={user ? "Ajouter un commentaire..." : "Connectez-vous pour commenter"}
                placeholderTextColor="#888"
                value={content}
                onChangeText={setContent}
                multiline
                maxLength={500}
                editable={!!user}
              />
              <TouchableOpacity
                style={[styles.postBtn, !content.trim() && styles.postBtnDisabled]}
                onPress={handlePost}
                disabled={!content.trim() || commentMutation.isPending}
              >
                {commentMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="send" size={20} color={content.trim() ? '#FFF' : '#888'} />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%', // Fixed height for the bottom sheet look
    paddingTop: 8,
  },
  handleIndicator: { 
    backgroundColor: '#333', 
    width: 40, 
    height: 4, 
    borderRadius: 2, 
    alignSelf: 'center', 
    marginBottom: 8 
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 14 },
  
  listContent: { padding: 16, paddingBottom: 20 },
  commentRow: { flexDirection: 'row', marginBottom: 16 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  userName: { color: '#888', fontSize: 13, fontWeight: '600' },
  timeText: { color: '#555', fontSize: 11 },
  commentText: { color: '#FFF', fontSize: 14, lineHeight: 20 },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#141414',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    color: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    minHeight: 40,
    fontSize: 14,
  },
  postBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  postBtnDisabled: {
    backgroundColor: '#222',
  },
});

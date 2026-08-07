import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image as RNImage, Linking, PanResponder, Modal, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio, Video, ResizeMode } from 'expo-av';
import { chatAPI, uploadAPI } from '../../src/lib/api';
import { useAuthStore, useChatStore } from '../../src/stores';
import { getGlobalSocket } from '../../src/lib/socket';
import { AudioPlayer } from './audio_player';
import { requestMediaLibraryPermission, requestCameraPermission, requestMicrophonePermission } from '../../src/lib/permissions';
import { hapticFeedback } from '../../src/lib/haptics';

const MessageImage = ({ uri }: { uri: string }) => {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    RNImage.getSize(uri, (w, h) => {
      if (w && h) setRatio(w / h);
    }, () => {});
  }, [uri]);

  return (
    <Image 
      source={{ uri }} 
      style={{ width: 250, aspectRatio: ratio, borderRadius: 16, marginBottom: 8, backgroundColor: '#222' }} 
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={150}
    />
  );
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<any>(null);
  const isRecordingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  
  const [isRecordingLocked, setIsRecordingLockedState] = useState(false);
  const isRecordingLockedRef = useRef(false);
  const setLock = (val: boolean) => {
    isRecordingLockedRef.current = val;
    setIsRecordingLockedState(val);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setLock(false);
        startRecording();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy < -40 && !isRecordingLockedRef.current) {
          setLock(true);
        }
      },
      onPanResponderRelease: () => {
        if (!isRecordingLockedRef.current) {
          stopRecordingAndSend();
        }
      },
      onPanResponderTerminate: () => {
        if (!isRecordingLockedRef.current) {
          stopRecordingAndSend();
        }
      }
    })
  ).current;

  const { data: convData, isLoading: isLoadingConv, isFetching: isFetchingConv, refetch: refetchConv } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatAPI.getConversations(),
  });
  const conversation = convData?.data?.data?.find((c: any) => c.id === id);

  const { data: messagesData } = useQuery({
    queryKey: ['chat-messages', id],
    queryFn: () => chatAPI.getMessages(id),
    enabled: !!conversation && conversation.status === 'ACCEPTED',
  });

  const { messagesCache, cacheMessages } = useChatStore();
  const fetchedMessages = messagesData?.data?.data;

  useEffect(() => {
    if (fetchedMessages) {
      cacheMessages(id, fetchedMessages);
    }
  }, [fetchedMessages, id, cacheMessages]);

  const messages = fetchedMessages || messagesCache[id] || conversation?.messages || [];
  // Sort newest first because FlatList is inverted
  const displayMessages = [...messages].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  useEffect(() => {
    const socket = getGlobalSocket();
    if (!socket) return;
    
    const handleIncomingMessage = (data: any) => {
      if (data.conversationId === id) {
        if (data.type === 'NEW_MESSAGE' || data.message) {
          const msg = data.message;
          if (msg) {
            queryClient.setQueryData(['chat-messages', id], (old: any) => {
              if (!old?.data?.data) return { data: { data: [msg] } };
              if (old.data.data.find((m: any) => m.id === msg.id)) return old;
              return { ...old, data: { ...old.data, data: [...old.data.data, msg] } };
            });
          }
        } else if (data.type === 'MESSAGE_DELETED' && data.messageId) {
          queryClient.setQueryData(['chat-messages', id], (old: any) => {
            if (!old?.data?.data) return old;
            return { ...old, data: { ...old.data, data: old.data.data.map((m: any) => m.id === data.messageId ? { ...m, isDeleted: true } : m) } };
          });
        }
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };
    
    socket.on('user:update', handleIncomingMessage);
    socket.on('NEW_MESSAGE', handleIncomingMessage);
    socket.on('MESSAGE_DELETED', handleIncomingMessage);
    
    return () => {
      socket.off('user:update', handleIncomingMessage);
      socket.off('NEW_MESSAGE', handleIncomingMessage);
      socket.off('MESSAGE_DELETED', handleIncomingMessage);
    };
  }, [id, queryClient]);

  const uploadFile = async (uri: string, type: 'image' | 'video' | 'audio' | 'document') => {
    const filename = uri.split('/').pop() || `file-${Date.now()}`;
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    let mimeType = 'application/octet-stream';
    if (type === 'image') {
      mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    } else if (type === 'video') {
      mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
    } else if (type === 'audio') {
      mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : 'audio/m4a';
    } else if (type === 'document') {
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'doc' || ext === 'docx') mimeType = 'application/msword';
      else if (ext === 'txt') mimeType = 'text/plain';
      else if (ext === 'zip') mimeType = 'application/zip';
      else mimeType = 'application/octet-stream';
    }

    const res = await uploadAPI.getPresignedUrl({ filename, contentType: mimeType, type });
    const { uploadUrl, publicUrl } = res.data.data;
    
    await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'PUT',
      headers: { 'Content-Type': mimeType },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    return publicUrl;
  };

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    try {
      const hasPerm = await requestMicrophonePermission();
      if (!hasPerm) {
        isRecordingRef.current = false;
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRecording);
      recordingRef.current = newRecording;
      setRecordingDuration(0);
      const interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setRecordingInterval(interval);
      await hapticFeedback.medium();
    } catch (err) {
      console.error('[Audio Recording Error]:', err);
      isRecordingRef.current = false;
    }
  };

  const cancelRecording = async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording) return;
    isRecordingRef.current = false;
    if (recordingInterval) clearInterval(recordingInterval);
    setRecording(null);
    recordingRef.current = null;
    setLock(false);
    try {
      await currentRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      await hapticFeedback.light();
    } catch(e){}
  };

  const stopRecordingAndSend = async () => {
    const currentRecording = recordingRef.current;
    if (!currentRecording) return;
    isRecordingRef.current = false;
    if (recordingInterval) clearInterval(recordingInterval);
    setRecording(null);
    recordingRef.current = null;
    setLock(false);
    
    let durationMs = 0;
    try {
      const status = await currentRecording.getStatusAsync();
      durationMs = status.durationMillis;
      await currentRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch(e){}
    
    if (durationMs < 1000) {
      // Appui trop court, on annule l'envoi
      return;
    }

    const uri = currentRecording.getURI();
    if (uri) {
      setIsUploading(true);
      try {
        const url = await uploadFile(uri, 'audio');
        const res = await chatAPI.sendMessage(id as string, { attachmentUrl: url, attachmentType: 'AUDIO', attachmentName: 'Note vocale' });
        queryClient.setQueryData(['chat-messages', id], (old: any) => {
          if (!old?.data?.data) return old;
          return { ...old, data: { ...old.data, data: [...old.data.data, res.data.data] } };
        });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        await hapticFeedback.success();
      } catch (e) {
        Alert.alert('Erreur', 'Envoi de la note vocale échoué.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const pickMediaFromGallery = async () => {
    setAttachmentModalVisible(false);
    // Wait for the modal to fully dismiss before launching the native picker
    await new Promise(resolve => setTimeout(resolve, 350));
    try {
      const hasPerm = await requestMediaLibraryPermission();
      if (!hasPerm) return;

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const isVid = asset.type === 'video' || (asset.fileName && asset.fileName.endsWith('.mp4'));
        const type = isVid ? 'video' : 'image';
        await hapticFeedback.selection();
        uploadAndSend(asset.uri, type, asset.fileName || `media-${Date.now()}.${isVid ? 'mp4' : 'jpg'}`);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'accéder à la galerie.');
    }
  };

  const takeCameraPhoto = async () => {
    setAttachmentModalVisible(false);
    // Wait for the modal to fully dismiss before launching the native camera
    await new Promise(resolve => setTimeout(resolve, 350));
    try {
      const hasPerm = await requestCameraPermission();
      if (!hasPerm) return;

      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        await hapticFeedback.selection();
        uploadAndSend(asset.uri, 'image', asset.fileName || `photo-${Date.now()}.jpg`);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'ouvrir la caméra.');
    }
  };

  const pickDocumentFile = async () => {
    setAttachmentModalVisible(false);
    // Wait for the modal to fully dismiss before launching the native file picker
    await new Promise(resolve => setTimeout(resolve, 350));
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: '*/*',
        multiple: false,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const doc = res.assets[0];
        await hapticFeedback.selection();
        uploadAndSend(doc.uri, 'document', doc.name || 'document');
      }
    } catch (err: any) {
      Alert.alert('Erreur', 'Impossible de sélectionner le document.');
    }
  };

  const handleAttachment = async () => {
    await hapticFeedback.light();
    setAttachmentModalVisible(true);
  };

  const uploadAndSend = async (uri: string, type: string, filename: string) => {
    setIsUploading(true);
    try {
      const url = await uploadFile(uri, type as any);
      let attachmentType = 'FILE';
      if (type === 'image') attachmentType = 'IMAGE';
      if (type === 'video') attachmentType = 'VIDEO';
      const res = await chatAPI.sendMessage(id as string, { attachmentUrl: url, attachmentType, attachmentName: filename });
      queryClient.setQueryData(['chat-messages', id], (old: any) => {
        if (!old?.data?.data) return old;
        return { ...old, data: { ...old.data, data: [...old.data.data, res.data.data] } };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) { Alert.alert('Erreur', 'Impossible d\'envoyer le fichier.'); }
    finally { setIsUploading(false); }
  };

  const handleSendText = async () => {
    if (!text.trim()) return;
    try {
      const content = text;
      setText('');
      const res = await chatAPI.sendMessage(id as string, { content });
      queryClient.setQueryData(['chat-messages', id], (old: any) => {
        if (!old?.data?.data) return old;
        return { ...old, data: { ...old.data, data: [...old.data.data, res.data.data] } };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) { Alert.alert('Erreur', 'Impossible d\'envoyer le message.'); }
  };

  if (isLoadingConv || (isFetchingConv && !conversation)) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FF5A00" /></View>;
  if (!conversation) return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity></View>
      <View style={styles.loadingContainer}><Text style={{ color: '#FFF' }}>Discussion introuvable.</Text></View>
    </SafeAreaView>
  );

  const isUser1 = conversation.user1Id === user?.id;
  const otherUser = isUser1 ? conversation.user2 : conversation.user1;
  const isPending = conversation.status === 'PENDING';
  const amIReceiver = isPending && conversation.user2Id === user?.id;

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    const isDeleted = item.isDeleted;
    const isAttachmentOnly = !item.content && item.attachmentType;

    const handleDelete = () => {
      if (!isMe || isDeleted) return;
      Alert.alert('Supprimer', 'Voulez-vous supprimer ce message ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => { await chatAPI.deleteMessage(item.id); } }
      ]);
    };

    return (
      <TouchableOpacity 
        style={[
          styles.messageBubble, 
          isMe ? styles.messageMe : styles.messageOther,
          isAttachmentOnly && { backgroundColor: 'transparent', padding: 0 }
        ]} 
        onLongPress={handleDelete} 
        activeOpacity={isMe && !isDeleted ? 0.7 : 1}
      >
        {isDeleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="ban-outline" size={14} color="#888" />
            <Text style={[styles.messageText, { fontStyle: 'italic', color: '#888', marginLeft: 6 }]}>Ce message a été supprimé</Text>
          </View>
        ) : (
          <View>
            {item.attachmentType === 'IMAGE' && <MessageImage uri={item.attachmentUrl} />}
            {item.attachmentType === 'VIDEO' && (
              <View style={{ width: 250, aspectRatio: 4/5, borderRadius: 16, overflow: 'hidden', marginBottom: 8, backgroundColor: '#222' }}>
                <Video 
                  source={{ uri: item.attachmentUrl }} 
                  style={{ width: '100%', height: '100%' }} 
                  useNativeControls 
                  resizeMode={ResizeMode.COVER} 
                />
              </View>
            )}
            {item.attachmentType === 'AUDIO' && <AudioPlayer uri={item.attachmentUrl} />}
            {item.attachmentType === 'FILE' && (
              <TouchableOpacity onPress={() => Linking.openURL(item.attachmentUrl)} style={styles.fileContainer}>
                 <Ionicons name="document" size={24} color="#FFF" />
                 <Text style={styles.fileName}>{item.attachmentName || 'Fichier'}</Text>
              </TouchableOpacity>
            )}
            {!!item.content && <Text style={styles.messageText}>{item.content}</Text>}
          </View>
        )}
        <Text style={styles.messageTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <Text style={styles.headerTitle}>{otherUser?.name || 'Utilisateur'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList 
          ref={flatListRef}
          data={displayMessages} 
          keyExtractor={(item) => item.id} 
          renderItem={renderMessage} 
          contentContainerStyle={styles.messageList}
          inverted={true}
        />

        {isPending ? (
          <View style={styles.pendingContainer}>
            <Text style={styles.pendingText}>{amIReceiver ? 'Cette personne souhaite discuter avec vous.' : 'Demande en attente.'}</Text>
            {amIReceiver && (
              <TouchableOpacity style={styles.acceptBtn} onPress={async () => { await chatAPI.acceptConversation(id); refetchConv(); }}>
                <Text style={styles.acceptBtnText}>Accepter la demande</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.inputContainer}>
            {recording && isRecordingLocked && (
              <TouchableOpacity onPress={cancelRecording} style={{ padding: 12 }}>
                <Ionicons name="trash" size={24} color="#FF3B30" />
              </TouchableOpacity>
            )}
            
            {!recording && (
              <TouchableOpacity onPress={handleAttachment} style={styles.attachBtn} disabled={isUploading}>
                <Ionicons name="add" size={28} color="#A0A0A0" />
              </TouchableOpacity>
            )}
            
            {recording ? (
              <View style={[styles.recordingUI, isRecordingLocked && { backgroundColor: 'transparent', paddingHorizontal: 0 }]}>
                <View style={[styles.redDot, { opacity: recordingDuration % 2 === 0 ? 1 : 0.4 }]} />
                <Text style={styles.recordingTime}>
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </Text>
                <View style={styles.waveContainer}>
                  {Array.from({ length: 15 }).map((_, i) => (
                    <View key={i} style={[styles.waveBar, { height: 8 + Math.random() * 16 }]} />
                  ))}
                </View>
                {!isRecordingLocked && (
                  <View style={styles.lockHint}>
                    <Ionicons name="chevron-up" size={16} color="#888" />
                    <Ionicons name="lock-closed" size={12} color="#888" />
                  </View>
                )}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Écrivez un message..."
                placeholderTextColor="#888"
                value={text}
                onChangeText={setText}
              />
            )}
            {isUploading ? (
              <ActivityIndicator style={{ marginLeft: 12 }} color="#FF5A00" />
            ) : text.trim() ? (
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendText}>
                <Ionicons name="send" size={20} color="#FFF" />
              </TouchableOpacity>
            ) : isRecordingLocked ? (
              <TouchableOpacity style={styles.sendBtn} onPress={stopRecordingAndSend}>
                <Ionicons name="send" size={20} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <View {...panResponder.panHandlers}>
                <View style={[styles.sendBtn, recording && { backgroundColor: '#E91E63' }]}>
                  <Ionicons name="mic" size={20} color="#FFF" />
                </View>
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Attachment Modal */}
      <Modal
        visible={attachmentModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAttachmentModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setAttachmentModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Joindre un fichier</Text>
            
            <View style={styles.modalOptionsGrid}>
              <TouchableOpacity 
                style={styles.modalOptionCard} 
                onPress={pickMediaFromGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIconBox, { backgroundColor: 'rgba(255, 90, 0, 0.15)' }]}>
                  <Ionicons name="images" size={26} color="#FF5A00" />
                </View>
                <Text style={styles.modalOptionTitle}>Galerie</Text>
                <Text style={styles.modalOptionSubtitle}>Photos & Vidéos</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalOptionCard} 
                onPress={takeCameraPhoto}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIconBox, { backgroundColor: 'rgba(52, 199, 89, 0.15)' }]}>
                  <Ionicons name="camera" size={26} color="#34C759" />
                </View>
                <Text style={styles.modalOptionTitle}>Caméra</Text>
                <Text style={styles.modalOptionSubtitle}>Prendre une photo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalOptionCard} 
                onPress={pickDocumentFile}
                activeOpacity={0.7}
              >
                <View style={[styles.modalOptionIconBox, { backgroundColor: 'rgba(0, 122, 255, 0.15)' }]}>
                  <Ionicons name="document-text" size={26} color="#007AFF" />
                </View>
                <Text style={styles.modalOptionTitle}>Document</Text>
                <Text style={styles.modalOptionSubtitle}>PDF & Fichiers</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.modalCloseButton} 
              onPress={() => setAttachmentModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  messageList: { padding: 16, paddingBottom: 20 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
  messageMe: { alignSelf: 'flex-end', backgroundColor: '#B24200', borderBottomRightRadius: 4 },
  messageOther: { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderBottomLeftRadius: 4 },
  messageText: { color: '#FFF', fontSize: 15 },
  messageTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  fileContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, marginBottom: 8 },
  fileName: { color: '#FFF', marginLeft: 8, flex: 1, fontSize: 13 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  attachBtn: { marginRight: 8, padding: 4 },
  input: { flex: 1, height: 44, backgroundColor: '#1A1A1A', borderRadius: 22, paddingHorizontal: 16, color: '#FFF', fontSize: 15 },
  sendBtn: { marginLeft: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF5A00', justifyContent: 'center', alignItems: 'center' },
  pendingContainer: { padding: 20, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222', alignItems: 'center' },
  pendingText: { color: '#A0A0A0', textAlign: 'center', marginBottom: 16, fontSize: 14, lineHeight: 20 },
  acceptBtn: { backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  acceptBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  recordingUI: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', height: 44, borderRadius: 22, paddingHorizontal: 16 },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E91E63', marginRight: 8 },
  recordingTime: { color: '#FFF', fontSize: 14, fontWeight: '600', marginRight: 12, width: 36 },
  waveContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waveBar: { width: 3, backgroundColor: '#FF5A00', borderRadius: 2 },
  lockHint: { alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    borderTopWidth: 1,
    borderTopColor: '#282828',
  },
  modalIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalOptionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalOptionCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalOptionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalOptionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
    textAlign: 'center',
  },
  modalOptionSubtitle: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
  },
  modalCloseButton: {
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#A0A0A0',
    fontSize: 15,
    fontWeight: '600',
  },
});

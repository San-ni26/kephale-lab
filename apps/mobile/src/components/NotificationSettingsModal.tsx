import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { artistsAPI } from '../lib/api';
import { useToast } from './ToastContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  artistId: string;
  initialPrefs: {
    notifyAll: boolean;
    notifyAlbums: boolean;
    notifyTracks: boolean;
    notifyVideos: boolean;
  };
}

export default function NotificationSettingsModal({ visible, onClose, artistId, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setPrefs(initialPrefs);
  }, [initialPrefs]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => artistsAPI.updateNotifications(artistId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-follow-status', artistId] });
      showToast('Préférences de notification mises à jour', 'success');
      onClose();
    },
    onError: () => {
      showToast('Erreur lors de la mise à jour', 'error');
    },
  });

  const handleSave = () => {
    updateMutation.mutate(prefs);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Toutes les notifications</Text>
            <Switch
              value={prefs.notifyAll}
              onValueChange={(val) => setPrefs({ ...prefs, notifyAll: val })}
              trackColor={{ false: '#333', true: '#FF5A00' }}
            />
          </View>
          <View style={styles.divider} />
          
          <View style={styles.row}>
            <Text style={[styles.label, prefs.notifyAll && styles.disabledText]}>Nouveaux albums</Text>
            <Switch
              value={prefs.notifyAll ? true : prefs.notifyAlbums}
              disabled={prefs.notifyAll}
              onValueChange={(val) => setPrefs({ ...prefs, notifyAlbums: val })}
              trackColor={{ false: '#333', true: '#FF5A00' }}
            />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, prefs.notifyAll && styles.disabledText]}>Nouveaux sons</Text>
            <Switch
              value={prefs.notifyAll ? true : prefs.notifyTracks}
              disabled={prefs.notifyAll}
              onValueChange={(val) => setPrefs({ ...prefs, notifyTracks: val })}
              trackColor={{ false: '#333', true: '#FF5A00' }}
            />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, prefs.notifyAll && styles.disabledText]}>Nouveaux clips/reels</Text>
            <Switch
              value={prefs.notifyAll ? true : prefs.notifyVideos}
              disabled={prefs.notifyAll}
              onValueChange={(val) => setPrefs({ ...prefs, notifyVideos: val })}
              trackColor={{ false: '#333', true: '#FF5A00' }}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={updateMutation.isPending}>
            <Text style={styles.saveBtnText}>{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#111',
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 8 },
  label: { color: '#FFF', fontSize: 16 },
  disabledText: { color: '#666' },
  saveBtn: {
    backgroundColor: '#FF5A00',
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});

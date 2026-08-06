import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert } from 'react-native';
import { create } from 'zustand';

export interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
  hideAlert: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  visible: false,
  title: '',
  message: '',
  buttons: [],
  showAlert: (title, message, buttons) => set({ visible: true, title, message, buttons }),
  hideAlert: () => set({ visible: false }),
}));

export function CustomAlertProvider() {
  const { visible, title, message, buttons, hideAlert } = useAlertStore();

  useEffect(() => {
    // Override default React Native Alert.alert globally
    const originalAlert = Alert.alert;
    Alert.alert = (title, msg, btns) => {
      useAlertStore.getState().showAlert(title, msg, btns);
    };

    return () => {
      Alert.alert = originalAlert; // restore on unmount if ever
    };
  }, []);

  if (!visible) return null;

  const defaultButtons: AlertButton[] = [{ text: 'OK', onPress: () => {} }];
  const actionButtons = buttons && buttons.length > 0 ? buttons : defaultButtons;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          
          <View style={styles.buttonsContainer}>
            {actionButtons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    isCancel && styles.cancelButton,
                    isDestructive && styles.destructiveButton,
                    !isCancel && !isDestructive && styles.defaultButton,
                    index > 0 && { marginTop: 8 }
                  ]}
                  onPress={() => {
                    hideAlert();
                    if (btn.onPress) btn.onPress();
                  }}
                >
                  <Text style={[
                    styles.buttonText,
                    isCancel && styles.cancelButtonText,
                    isDestructive && styles.destructiveButtonText
                  ]}>
                    {btn.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#A0A0A0',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonsContainer: {
    width: '100%',
    flexDirection: 'column',
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  defaultButton: {
    backgroundColor: '#FF5A00',
    borderColor: '#FF5A00',
  },
  cancelButton: {
    backgroundColor: '#2A2A2A',
    borderColor: '#333',
  },
  destructiveButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#CCC',
  },
  destructiveButtonText: {
    color: '#FF3B30',
  }
});

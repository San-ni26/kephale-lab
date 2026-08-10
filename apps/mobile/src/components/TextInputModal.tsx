import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard
} from 'react-native';

interface TextInputModalProps {
  visible: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export default function TextInputModal({
  visible,
  title,
  description,
  placeholder = '',
  initialValue = '',
  confirmText = 'Valider',
  cancelText = 'Annuler',
  onConfirm,
  onCancel,
}: TextInputModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
      setValue('');
    }
  };

  const handleCancel = () => {
    setValue('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}

            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor="#666"
              value={value}
              onChangeText={setValue}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelText}>{cancelText}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, !value.trim() && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={!value.trim()}
              >
                <Text style={styles.confirmText}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    color: '#AAA',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 16,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  cancelText: {
    color: '#CCC',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF5A00',
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#3A1A00',
    opacity: 0.6,
  },
  confirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { livesAPI } from '../../src/lib/api';

LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  monthNamesShort: ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'],
  dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  dayNamesShort: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  today: 'Aujourd\'hui'
};
LocaleConfig.defaultLocale = 'fr';

export default function CreateLiveScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'VIDEO' | 'AUDIO'>('VIDEO');
  const [allowGuests, setAllowGuests] = useState(true);
  const [maxGuests, setMaxGuests] = useState('5');
  const [duration, setDuration] = useState('60');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(''); // YYYY-MM-DD
  const [scheduledTime, setScheduledTime] = useState('20:00'); // HH:mm
  
  const [isLoading, setIsLoading] = useState(false);

  const handleStartLive = async () => {
    if (!title.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un titre pour votre live.');
      return;
    }
    
    setIsLoading(true);
    try {
      // 1. Create the scheduled live session
      let parsedDate = null;
      if (isScheduled) {
        if (!scheduledDate) {
          Alert.alert('Erreur', 'Veuillez sélectionner une date sur le calendrier.');
          setIsLoading(false);
          return;
        }
        const timeStr = scheduledTime.trim() || '20:00';
        const combined = `${scheduledDate}T${timeStr.replace('h', ':')}:00`;
        const d = new Date(combined);
        parsedDate = isNaN(d.getTime()) ? new Date(Date.now() + 3600000).toISOString() : d.toISOString();
      }

      const createRes = await livesAPI.create({
        title,
        description,
        mode,
        allowGuests,
        maxGuests: parseInt(maxGuests) || (mode === 'VIDEO' ? 5 : 50),
        duration: parseInt(duration) || 60,
        scheduledAt: parsedDate,
      });
      
      const liveId = createRes.data?.data?.id;
      if (!liveId) throw new Error('Live ID introuvable.');

      if (isScheduled) {
        Alert.alert('Succès', 'Votre live a été programmé avec succès.');
        router.back();
        return;
      }

      // 2. Start the live to get publisher tokens
      const startRes = await livesAPI.start(liveId);
      const liveData = startRes.data?.data;
      
      router.replace(`/live/${liveId}`); // Navigate to the immersive player
    } catch (e: any) {
      Alert.alert('Erreur', e.response?.data?.error?.message || 'Erreur lors du lancement du live.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lancer un Live</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Titre du Live</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Soirée Acoustique Inédite"
          placeholderTextColor="#666"
          value={title}
          onChangeText={setTitle}
          maxLength={60}
        />

        <Text style={styles.label}>Description (Optionnel)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="De quoi allez-vous parler ?"
          placeholderTextColor="#666"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Mode de diffusion</Text>
        <View style={styles.modeContainer}>
          <TouchableOpacity 
            style={[styles.modeBtn, mode === 'VIDEO' && styles.modeBtnActive]}
            onPress={() => setMode('VIDEO')}
          >
            <Ionicons name="videocam" size={24} color={mode === 'VIDEO' ? '#FFF' : '#A0A0A0'} />
            <Text style={[styles.modeText, mode === 'VIDEO' && styles.modeTextActive]}>Vidéo</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modeBtn, mode === 'AUDIO' && styles.modeBtnActive]}
            onPress={() => setMode('AUDIO')}
          >
            <Ionicons name="mic" size={24} color={mode === 'AUDIO' ? '#FFF' : '#A0A0A0'} />
            <Text style={[styles.modeText, mode === 'AUDIO' && styles.modeTextActive]}>Audio</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={styles.switchLabel}>Autoriser les invités</Text>
            <Text style={styles.switchDesc}>Les auditeurs peuvent demander à monter sur scène</Text>
          </View>
          <Switch
            value={allowGuests}
            onValueChange={setAllowGuests}
            trackColor={{ false: '#333', true: '#FF5A00' }}
            thumbColor="#FFF"
          />
        </View>

        {allowGuests && (
          <View style={styles.inputRow}>
            <Text style={styles.rowLabel}>Max. participants</Text>
            <TextInput
              style={styles.smallInput}
              keyboardType="number-pad"
              value={maxGuests}
              onChangeText={setMaxGuests}
            />
          </View>
        )}

        <View style={styles.inputRow}>
          <Text style={styles.rowLabel}>Durée prévue (min)</Text>
          <TextInput
            style={styles.smallInput}
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={styles.switchLabel}>Programmer pour plus tard</Text>
            <Text style={styles.switchDesc}>Planifier une date de diffusion au lieu de démarrer maintenant</Text>
          </View>
          <Switch
            value={isScheduled}
            onValueChange={setIsScheduled}
            trackColor={{ false: '#333', true: '#FF5A00' }}
            thumbColor="#FFF"
          />
        </View>

        {isScheduled && (
          <View style={{ marginTop: 20 }}>
            <Calendar
              onDayPress={(day: any) => setScheduledDate(day.dateString)}
              markedDates={{
                [scheduledDate]: { selected: true, selectedColor: '#FF5A00' }
              }}
              minDate={new Date().toISOString().split('T')[0]}
              theme={{
                calendarBackground: '#1A1A1A',
                textSectionTitleColor: '#A0A0A0',
                selectedDayBackgroundColor: '#FF5A00',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#FF5A00',
                dayTextColor: '#FFF',
                textDisabledColor: '#333',
                monthTextColor: '#FFF',
                arrowColor: '#FF5A00',
              }}
              style={{ borderRadius: 12, overflow: 'hidden' }}
            />

            <View style={[styles.inputRow, { marginTop: 16 }]}>
              <Text style={styles.rowLabel}>Heure (HH:mm)</Text>
              <TextInput
                style={[styles.smallInput, { width: 100 }]}
                placeholder="20:00"
                placeholderTextColor="#666"
                value={scheduledTime}
                onChangeText={setScheduledTime}
              />
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={styles.startBtn} 
          onPress={handleStartLive}
          disabled={isLoading || !title.trim()}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.startBtnText}>{isScheduled ? 'Programmer le Live' : 'Démarrer le Live'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  closeBtn: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 20 },
  label: { color: '#FFF', fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    color: '#FFF',
    fontSize: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  modeContainer: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modeBtn: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  modeBtnActive: { backgroundColor: '#FF5A00' },
  modeText: { color: '#A0A0A0', fontSize: 16, fontWeight: '600' },
  modeTextActive: { color: '#FFF' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  switchLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  switchDesc: { color: '#888', fontSize: 13, marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  rowLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  smallInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 16,
    width: 80,
    textAlign: 'center',
  },
  startBtn: {
    backgroundColor: '#FF5A00',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 40,
  },
  startBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' }
});

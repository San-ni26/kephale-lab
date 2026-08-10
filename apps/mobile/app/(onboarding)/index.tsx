import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUIStore } from '../../src/stores';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const { setHasSeenOnboarding } = useUIStore();

  const handleStart = () => {
    setHasSeenOnboarding(true);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/onboarding_bg.png')}
        style={styles.backgroundImage}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', '#000000']}
        style={styles.background}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Feather name="music" size={80} color="#FF5A00" />
            <Text style={styles.title}>Kephale</Text>
            <Text style={styles.subtitle}>La plateforme de streaming musical africaine</Text>
          </View>

          <View style={styles.featuresContainer}>
            <FeatureItem
              icon="music"
              title="Musique"
              description="Écoutez les meilleurs morceaux"
            />
            <FeatureItem
              icon="play-circle"
              title="Clips"
              description="Regardez les clips exclusifs"
            />
            <FeatureItem
              icon="video"
              title="Vidéos"
              description="Découvrez des vidéos au format TikTok"
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleStart}>
            <Text style={styles.buttonText}>Commencer l'expérience</Text>
            <Feather name="arrow-right" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function FeatureItem({ icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.iconContainer}>
        <Feather name={icon} size={32} color="#FF5A00" />
      </View>
      <View style={styles.featureTextContainer}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
    marginTop: 8,
    textAlign: 'center',
  },
  featuresContainer: {
    gap: 32,
    marginVertical: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 90, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  button: {
    backgroundColor: '#FF5A00',
    flexDirection: 'row',
    padding: 18,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

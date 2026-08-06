import { Redirect } from 'expo-router';
import { useUIStore } from '../src/stores';

export default function Index() {
  const { hasSeenOnboarding } = useUIStore();

  if (!hasSeenOnboarding) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)" />;
}

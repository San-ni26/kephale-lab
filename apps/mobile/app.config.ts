import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kephale',
  slug: 'kephale',
  version: '1.0.0',
  sdkVersion: '54.0.0',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'kephale',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0D0D0D',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.kephale.mobile',
    buildNumber: '1',
    infoPlist: {
      UIBackgroundModes: ['audio', 'fetch', 'remote-notification'],
      NSMicrophoneUsageDescription: 'Kephale a besoin d\'accéder à votre micro pour enregistrer des notes vocales dans les discussions, lancer des lives et enregistrer des vidéos.',
      NSCameraUsageDescription: 'Kephale a besoin d\'accéder à votre caméra pour prendre des photos et vidéos dans les discussions, enregistrer des Reels et lancer des lives.',
      NSPhotoLibraryUsageDescription: 'Kephale a besoin d\'accéder à votre galerie photo et vidéo pour envoyer des médias dans les discussions, importer des Reels, musiques et photos de profil.',
      NSPhotoLibraryAddUsageDescription: 'Kephale a besoin d\'enregistrer des médias dans votre galerie.',
    },
  },
  android: {
    adaptiveIcon: {
      // foregroundImage: './assets/adaptive-icon.png',  // Uncomment when asset exists
      backgroundColor: '#0D0D0D',
    },
    package: 'app.kephale.mobile',
    versionCode: 1,
    permissions: [
      'RECORD_AUDIO',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      'READ_MEDIA_AUDIO',
      'FOREGROUND_SERVICE',
      'RECEIVE_BOOT_COMPLETED',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-video',
    'expo-web-browser',
    [
      'expo-image-picker',
      {
        photosPermission: 'Kephale a besoin d\'accéder à vos photos et vidéos.',
        cameraPermission: 'Kephale a besoin d\'accéder à votre caméra.',
      },
    ],
    // '@stripe/stripe-react-native',  // Requires dev client build (EAS), not Expo Go
    '@livekit/react-native-expo-plugin',
    [
      'react-native-google-mobile-ads',
      {
        /**
         * REPLACE these App IDs with your production AdMob App IDs from:
         * https://apps.admob.com → Your App → App settings → App ID
         *
         * Current values: Google official test App IDs (safe for development)
         * Production format: ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
         */
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_APP_ID_ANDROID || 'ca-app-pub-3940256099942544~3347511713',
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS || 'ca-app-pub-3940256099942544~1458002511',
        // SKAdNetworkItems required by Apple for iOS 14+ attribution
        skAdNetworkItems: [
          'cstr6suwn9.skadnetwork',
          '4fzdc2evr5.skadnetwork',
          '2fnua5tdw4.skadnetwork',
          'ydx93a7ass.skadnetwork',
          '5a6flpkh64.skadnetwork',
          'p78axxw29g.skadnetwork',
          'v72qych5uu.skadnetwork',
          'c6k4g5qg8m.skadnetwork',
          's39g8k73mm.skadnetwork',
          '3qy4746246.skadnetwork',
          '3sh42y64l3.skadnetwork',
        ],
        // User tracking: required for GDPR / ATT compliance
        userTrackingUsageDescription:
          'Cette app utilise Google AdMob pour afficher des publicités personnalisées. Votre identifiant publicitaire peut être utilisé à cette fin.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || process.env.API_URL || 'https://kephale-lab.onrender.com',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    // AdMob App IDs (for reference in runtime code)
    admobAppIdAndroid: process.env.EXPO_PUBLIC_ADMOB_APP_ID_ANDROID || 'ca-app-pub-3940256099942544~3347511713',
    admobAppIdIos: process.env.EXPO_PUBLIC_ADMOB_APP_ID_IOS || 'ca-app-pub-3940256099942544~1458002511',
    eas: {
      projectId: 'c27d4283-7031-45e9-a8b4-d1b90dae91fa',
    },
  },
});


import type { ExpoConfig } from 'expo/config';

import { allowsCleartextTraffic, resolveBuildVariant } from './src/constants/buildVariant.ts';

const variant = resolveBuildVariant(process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE);

const config: ExpoConfig = {
  name: variant === 'production' ? 'Clementine' : `Clementine (${variant})`,
  slug: 'clementine',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'clementine',
  userInterfaceStyle: 'automatic',
  // New architecture is the SDK 57 default; asserted via app.json schema, not typed here.
  // `usesCleartextTraffic` is a valid Expo key that the current ExpoConfig
  // types omit, hence the narrow cast.
  android: {
    package:
      variant === 'production'
        ? 'com.zyd.clementine'
        : `com.zyd.clementine.${variant}`,
    // Dev/preview builds reach a local Hermes over LAN, 10.0.2.2, or Tailscale —
    // none of which serve TLS. Production never gets this allowance.
    usesCleartextTraffic: allowsCleartextTraffic(variant),
  } as ExpoConfig['android'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.zyd.clementine',
    infoPlist: {
      // Mirror of the Android policy above. Phase 8 owns the full iOS story.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: allowsCleartextTraffic(variant),
      },
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Profile avatar upload. The permission string is what iOS shows when
    // the picker first opens; the picker itself needs no storage permission
    // on Android (system photo picker) but the plugin keeps the build honest.
    [
      'expo-image-picker',
      {
        photosPermission:
          'Clementine lets you choose a photo for your profile avatar. It is stored only on this device.',
      },
    ],
    // Declares RECORD_AUDIO on Android and the microphone usage string on
    // iOS. whisper.rn has no config plugin of its own, so the recorder's
    // plugin is what makes the mic reachable at all.
    [
      'expo-audio',
      {
        microphonePermission:
          'Clementine uses the microphone for voice mode. Speech is transcribed on-device and never leaves the phone.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { variant },
};

export default config;

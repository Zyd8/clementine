import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';
import { initTelemetry } from '@/utils/telemetry';

initTelemetry({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });

export default function RootLayout() {
  const theme = useTheme();

  // Loaded at runtime so Expo Go and dev clients get the real face without a
  // native rebuild. The keys are the family names the theme tokens reference.
  const [fontsLoaded] = useFonts({
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-SemiBold': require('../assets/fonts/JetBrainsMono-SemiBold.ttf'),
    'JetBrainsMono-Bold': require('../assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateConnection = useConnectionStore((s) => s.hydrate);
  const hydrated = useConnectionStore((s) => s.hydrated);
  const connection = useConnectionStore((s) => s.connection);

  useEffect(() => {
    void hydrateSettings();
    void hydrateConnection();
  }, [hydrateSettings, hydrateConnection]);

  // First launch with no stored connection lands on setup automatically.
  useEffect(() => {
    if (!hydrated) return;
    router.replace(connection ? '/' : '/setup');
  }, [hydrated, connection]);

  // Hold a blank canvas until hydration settles and the font is in memory,
  // rather than flashing the wrong screen, the wrong theme, or a frame of
  // proportional fallback text.
  if (!hydrated || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.canvas },
        headerTintColor: theme.colors.ink,
        headerTitleStyle: { fontFamily: theme.fonts.bold, fontSize: 20 },
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'CLEMENTINE' }} />
      <Stack.Screen name="sessions" options={{ title: 'SESSIONS' }} />
      <Stack.Screen name="voice-profile" options={{ title: 'VOICE PROFILE' }} />
      <Stack.Screen name="setup" options={{ title: 'CONNECT HERMES' }} />
    </Stack>
  );
}

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

  // Hold a blank canvas until hydration settles, rather than flashing the
  // wrong screen or the wrong theme.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.canvas },
        headerTintColor: theme.colors.ink,
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'CLEMENTINE' }} />
      <Stack.Screen name="setup" options={{ title: 'CONNECT HERMES' }} />
    </Stack>
  );
}

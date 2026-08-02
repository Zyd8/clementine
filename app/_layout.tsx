import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';
import { useSettingsStore } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import { redirectTarget } from '@/utils/routeGuard';
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

  const segments = useSegments();
  const rootSegment = segments[0];

  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateConnection = useConnectionStore((s) => s.hydrate);
  const hydrateProfiles = useProfilesStore((s) => s.hydrate);
  const hydrateVoiceProfile = useVoiceProfileStore((s) => s.hydrate);
  const hydrated = useConnectionStore((s) => s.hydrated);
  const connection = useConnectionStore((s) => s.connection);

  useEffect(() => {
    void hydrateSettings();
    void hydrateConnection();
    // These are display and configuration state — the gate below waits only
    // on the connection, so a slow read here never holds up first paint.
    void hydrateProfiles();
    // Without this the voice profile writes to SecureStore and never reads
    // back: provider keys looked unsaved on every relaunch.
    void hydrateVoiceProfile();
  }, [
    hydrateSettings,
    hydrateConnection,
    hydrateProfiles,
    hydrateVoiceProfile,
  ]);

  // First launch with no stored connection lands on setup automatically.
  //
  // Gated on `fontsLoaded` too, because that is what decides whether the
  // <Stack> below is mounted — navigating while it is not writes to
  // expo-router's navigation store with nothing to receive it. The target is
  // computed rather than always replaced so a route that is already correct
  // schedules no navigation at all; replacing unconditionally re-renders this
  // layout, which re-runs the effect, until React aborts with "Maximum update
  // depth exceeded".
  useEffect(() => {
    if (!hydrated || !fontsLoaded) return;
    const target = redirectTarget({ hasConnection: connection !== null, rootSegment });
    if (target) router.replace(target);
  }, [hydrated, fontsLoaded, connection, rootSegment]);

  // Hold a blank canvas until hydration settles and the font is in memory,
  // rather than flashing the wrong screen, the wrong theme, or a frame of
  // proportional fallback text.
  if (!hydrated || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.canvas },
          headerTintColor: theme.colors.ink,
          headerTitleStyle: { fontFamily: theme.fonts.bold, fontSize: theme.type(20) },
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        {/* The tab group draws its own per-screen headers and the tab bar, so
            the stack must not stack a second header on top of it. Naming a
            route here that no longer exists at this level is what produced
            "No route named index exists in nested children". */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="voice" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: 'CONNECT HERMES' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

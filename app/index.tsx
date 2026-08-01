import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';

/**
 * Chat placeholder.
 *
 * Phase 4 replaces this with the real streaming chat surface (and Phase 5
 * adds the tab bar). For now it proves the Phase 2 loop end to end: a
 * validated connection lands here, and reconfigure/disconnect are reachable.
 */
export default function ChatScreen() {
  const theme = useTheme();
  const connection = useConnectionStore((s) => s.connection);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const themePreference = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const cycleTheme = () =>
    void setTheme(
      themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system',
    );

  return (
    <View
      style={{
        backgroundColor: theme.colors.canvas,
        flex: 1,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
      }}
    >
      <Text style={{ color: theme.colors.ink, ...theme.typography.heading }}>
        {connection?.name ?? 'CONNECTED'}
      </Text>
      <Text style={{ color: theme.colors.inkMuted, ...theme.typography.mono }}>
        {connection?.baseUrl}
      </Text>
      <Text style={{ color: theme.colors.inkMuted, ...theme.typography.mono }}>
        Chat arrives in Phase 4.
      </Text>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <Button label={`THEME: ${themePreference.toUpperCase()}`} onPress={cycleTheme} />
        <Button label="RECONFIGURE" onPress={() => router.push('/setup')} />
        <Button
          label="DISCONNECT"
          onPress={() => {
            void disconnect().then(() => router.replace('/setup'));
          }}
        />
      </View>
    </View>
  );
}

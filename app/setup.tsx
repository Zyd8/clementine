import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useConnectionSetup } from '@/hooks/useConnectionSetup';
import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';

/**
 * Connect (and reconfigure) the one Hermes instance.
 *
 * Thin by design: all validation and persistence lives in
 * `useConnectionSetup`. This file renders state and navigates.
 */
export default function SetupScreen() {
  const theme = useTheme();
  const { status, error, submit } = useConnectionSetup();
  const existing = useConnectionStore((s) => s.connection);

  const [name, setName] = useState(existing?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');

  const busy = status === 'validating';

  const onConnect = async () => {
    if (await submit({ name, baseUrl, apiKey })) router.replace('/');
  };

  return (
    <ScrollView
      contentContainerStyle={{
        backgroundColor: theme.colors.canvas,
        flexGrow: 1,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
      }}
    >
      {/* Onboarding hand-holding: the one command that answers "where's my key?" */}
      <View
        style={{
          backgroundColor: theme.colors.canvasRaised,
          borderColor: theme.colors.steel,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          padding: theme.spacing.md,
        }}
      >
        <Text style={{ color: theme.colors.inkMuted, ...theme.typography.mono }}>
          On your Hermes machine, run:
        </Text>
        <Text style={{ color: theme.colors.gold, ...theme.typography.mono }}>
          grep API_SERVER_KEY ~/.hermes/.env
        </Text>
        <Text style={{ color: theme.colors.inkMuted, ...theme.typography.mono }}>
          Then paste the URL and key here.
        </Text>
      </View>

      {existing ? (
        <Text style={{ color: theme.colors.err, ...theme.typography.mono }}>
          Replacing the current connection ({existing.baseUrl}) wipes its stored key
          and local state.
        </Text>
      ) : null}

      <Field label="NAME (OPTIONAL)" value={name} onChangeText={setName} />
      <Field
        label="SERVER URL"
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="http://100.106.162.39:8642"
        invalid={status === 'error'}
      />
      <Field label="API KEY" value={apiKey} onChangeText={setApiKey} secret />

      {error ? (
        <View
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.err,
            borderRadius: theme.radius.sm,
            borderWidth: 1,
            padding: theme.spacing.sm,
          }}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: theme.colors.err, ...theme.typography.mono }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      <Button
        label="VALIDATE & CONNECT"
        busyLabel="VALIDATING…"
        busy={busy}
        onPress={() => void onConnect()}
      />
    </ScrollView>
  );
}

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useConnectionSetup } from '@/hooks/useConnectionSetup';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
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

  const insets = useSafeAreaInsets();
  // KeyboardAvoidingView did nothing on Android — see useKeyboardOverlap.
  const screenRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(screenRef);

  const onConnect = async () => {
    if (await submit({ name, baseUrl, apiKey })) router.replace('/');
  };

  return (
    // The wrapper carries the ref: the keyboard covers the bottom of the
    // screen, and that is what the scroll content has to clear.
    <View ref={screenRef} style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{
        backgroundColor: theme.colors.canvas,
        flexGrow: 1,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        // Clears the gesture bar, then the keyboard on top of it.
        paddingBottom: theme.spacing.lg + insets.bottom + keyboardOverlap,
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
          grep CLEMENTINE_API_KEY ~/.hermes/.env
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
    </View>
  );
}

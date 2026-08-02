import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /**
   * Masks input AND locks it down: no context menu, no autofill. Used for
   * provider API keys, which are agent access. Not a toggle — a key must be
   * enterable and unreadable, so the two always travel together.
   */
  secret?: boolean;
  invalid?: boolean;
};

/** A labelled text input. Steel border when idle, err when invalid. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secret,
  invalid,
}: FieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      <Text
        style={{
          color: theme.colors.inkMuted,
          fontFamily: theme.typography.mono.fontFamily,
          fontSize: theme.typography.mono.fontSize,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </Text>
      <TextInput
        aria-label={label}
        // RN has no `invalid` accessibility state; a hint is the typed way to
        // announce it rather than relying on the red border alone.
        {...(invalid ? { accessibilityHint: `${label} is invalid` } : {})}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkMuted}
        secureTextEntry={Boolean(secret)}
        // Masking hides the glyphs; these stop the key leaving the field.
        // Android's long-press menu still offers Copy on a secureTextEntry
        // input, and autofill will suggest a saved key into other apps.
        contextMenuHidden={Boolean(secret)}
        {...(secret
          ? ({
              autoComplete: 'off',
              textContentType: 'none',
              importantForAutofill: 'no',
            } as const)
          : {})}
        // URLs and keys are case- and character-exact; autocorrect is a bug source.
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.canvasRaised,
            borderColor: invalid ? theme.colors.err : theme.colors.steel,
            borderRadius: theme.radius.sm,
            color: theme.colors.ink,
            fontFamily: theme.typography.body.fontFamily,
            fontSize: theme.typography.body.fontSize,
            padding: theme.spacing.sm + theme.spacing.xs,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  input: { borderWidth: 1, width: '100%' },
});

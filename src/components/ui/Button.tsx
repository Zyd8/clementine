import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** Shown in place of `label` while busy. */
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
};

/**
 * The primary action. Gold when it is the live thing to do, gold-dim while
 * in flight — the same focus language the rest of the app uses.
 */
export function Button({ label, onPress, busyLabel, busy, disabled }: ButtonProps) {
  const theme = useTheme();
  const inert = Boolean(busy || disabled);

  return (
    <Pressable
      role="button"
      accessibilityState={{ busy: Boolean(busy), disabled: inert }}
      disabled={inert}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: busy ? theme.colors.goldDim : theme.colors.gold,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.md,
          opacity: disabled && !busy ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: theme.colors.canvas,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: theme.typography.body.fontSize,
          fontWeight: '700',
        }}
      >
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', width: '100%' },
});

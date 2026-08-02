import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type StepperProps = {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Suffix shown after the number, e.g. "ms". */
  unit: string;
};

/**
 * A clamped +/- control for a numeric setting.
 *
 * A stepper rather than a slider because these are millisecond timings where
 * the exact number matters and a slider cannot be landed on one reliably.
 */
export function Stepper({ label, value, step, min, max, onChange, unit }: StepperProps) {
  const theme = useTheme();

  const button = (direction: -1 | 1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${direction === -1 ? 'Decrease' : 'Increase'} ${label}`}
      onPress={() =>
        onChange(
          direction === -1
            ? Math.max(min, value - step)
            : Math.min(max, value + step),
        )
      }
      style={{
        backgroundColor: theme.colors.canvasRaised,
        borderColor: theme.colors.steel,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        style={{
          color: theme.colors.ink,
          fontFamily: theme.fonts.regular,
          fontSize: theme.type(14),
        }}
      >
        {direction === -1 ? '−' : '+'}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text
        style={{
          color: theme.colors.inkMuted,
          fontFamily: theme.fonts.regular,
          fontSize: theme.type(10.5),
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <View
        style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
      >
        {button(-1)}
        <Text
          accessibilityLabel={`${label} is ${value}${unit}`}
          style={{
            color: theme.colors.gold,
            flex: 1,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type(15),
            textAlign: 'center',
          }}
        >
          {`${value}${unit}`}
        </Text>
        {button(1)}
      </View>
    </View>
  );
}

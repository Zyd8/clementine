import React from 'react';
import { View, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type VoiceWaveformProps = {
  /** Audio level 0–1. Drives bar heights. */
  level: number;
  /** Whether the waveform should be visible/active. */
  isActive: boolean;
  /** Test ID for testing. */
  testID?: string;
};

/** Number of bars in the waveform. */
const BAR_COUNT = 5;

/**
 * Audio level visualization — simple deterministically-sized bars
 * driven by the `level` prop (0–1). Gold stroke, transparent background.
 *
 * No native audio calls — pure prop-driven rendering so it works in tests
 * without expo-av or any audio package installed.
 */
export function VoiceWaveform({ level, isActive, testID }: VoiceWaveformProps) {
  const theme = useTheme();
  const clampedLevel = Math.max(0, Math.min(1, level));

  return (
    <View style={styles.container} accessibilityLabel="Audio waveform" testID={testID}>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        // Deterministic height from the level + bar index:
        // bars near the center grow more than outer bars.
        const position = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
        const barScale = isActive ? 0.2 + 0.8 * clampedLevel * (1 - position * 0.5) : 0.2;
        const height = Math.round(barScale * 40);

        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height,
                width: 4,
                backgroundColor: isActive ? theme.colors.gold : theme.colors.steel,
                opacity: isActive ? 1 : 0.5,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    height: 40,
    backgroundColor: 'transparent',
  },
  bar: {
    borderRadius: 2,
  },
});

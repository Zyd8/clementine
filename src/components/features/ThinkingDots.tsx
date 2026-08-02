import React, { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

const DOTS = [0, 1, 2];
/** The design staggers the three dots by 0.18s over a 1.1s cycle. */
const CYCLE_MS = 1100;
const STAGGER_MS = 180;

/**
 * The agent is working but has not emitted a token yet.
 *
 * Fills the gap between `run.created` and the first `assistant.delta`, which
 * on a tool-heavy turn can be several seconds of nothing. Without it the
 * scrollback looks stalled.
 */
export function ThinkingDots({ testID }: { testID?: string }) {
  const theme = useTheme();
  // Lazy state, not a ref: the values are created once and read during
  // render to build the styles, which a ref is not allowed to be used for.
  const [values] = useState(() => DOTS.map(() => new Animated.Value(0.3)));

  useEffect(() => {
    const animations = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * STAGGER_MS),
          Animated.timing(value, {
            toValue: 1,
            duration: CYCLE_MS / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration: CYCLE_MS / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    animations.forEach((animation) => animation.start());
    // Loops run until the bubble unmounts; leaving them running would keep a
    // driver alive per completed turn.
    return () => animations.forEach((animation) => animation.stop());
  }, [values]);

  return (
    <View
      testID={testID}
      accessibilityLabel="Agent is thinking"
      style={{
        alignItems: 'center',
        borderLeftColor: theme.colors.gold,
        borderLeftWidth: 2,
        flexDirection: 'row',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      {values.map((value, index) => (
        <Animated.View
          key={DOTS[index]}
          style={{
            backgroundColor: theme.colors.gold,
            borderRadius: theme.radius.full,
            height: 6,
            opacity: value,
            width: 6,
          }}
        />
      ))}
    </View>
  );
}

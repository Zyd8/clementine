import React, { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/** Below this the mic is picking up room tone, not speech. */
export const SPEECH_FLOOR = 0.12;

type SpeechPulseProps = {
  /** Live input level, 0–1. */
  level: number;
  /** False while the mic is closed, so a stale level cannot keep it alive. */
  listening: boolean;
  /**
   * Level that counts as speech. Defaults to the quiet-room floor, but the
   * voice screen passes the VAD's learned threshold so the halo and the thing
   * that ends the turn agree about what silence is.
   */
  floor?: number;
  /** How far outside the parent's edge the halo sits. */
  inset?: number;
  testID?: string;
};

/**
 * A green halo that flashes while the mic is actually hearing you.
 *
 * Green rather than gold: gold already means "this is the live element", so
 * reusing it here would add no information. Green is the app's ok colour and
 * reads as "your voice is getting through" — which a static "listening" label
 * cannot tell you, since it looks identical whether the mic works or not.
 *
 * Absolutely positioned around its parent so it never covers the content
 * inside the circle.
 */
export function SpeechPulse({
  level,
  listening,
  floor = SPEECH_FLOOR,
  inset = 5,
  testID,
}: SpeechPulseProps) {
  const theme = useTheme();
  const active = listening && level >= floor;

  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 350,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    // Stopped on unmount, and whenever speech drops away — a loop left
    // running holds a driver alive for every turn taken.
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel="Hearing you"
      pointerEvents="none"
      style={{
        borderColor: theme.colors.ok,
        borderRadius: theme.radius.full,
        borderWidth: 3,
        bottom: -inset,
        left: -inset,
        opacity: pulse,
        position: 'absolute',
        right: -inset,
        top: -inset,
      }}
    />
  );
}

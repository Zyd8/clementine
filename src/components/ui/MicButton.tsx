import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { VoiceChatState } from '@/types/voice';

type MicButtonProps = {
  /** Current voice chat state. */
  voiceState: VoiceChatState;
  /** Tap to start/cancel/interrupt. Not hold — tap semantics. */
  onPress: () => void;
  /** 64 in the voice overlay, 46 in the chat composer. */
  size?: number;
  testID?: string;
};

/**
 * The tap-to-talk mic button.
 *
 * Four visual states:
 *   IDLE       — gold-filled circle, ready to start
 *   LISTENING  — canvas-raised, gold border, "listening..." label
 *   PROCESSING — gold-dim filled circle, dimmed
 *   PLAYING    — same as PROCESSING (agent is talking)
 *
 * TAP semantics (not hold) — matches the interaction contract:
 * tap once to start, tap again to cancel, tap during playback to interrupt.
 */
export function MicButton({ voiceState, onPress, size = 64, testID }: MicButtonProps) {
  const theme = useTheme();

  const isActive = voiceState === 'LISTENING';
  const isBusy = voiceState === 'PROCESSING' || voiceState === 'PLAYING';

  const label = (() => {
    switch (voiceState) {
      case 'IDLE':
        return 'Tap to talk';
      case 'LISTENING':
        return 'Listening...';
      case 'PROCESSING':
        return 'Thinking...';
      case 'PLAYING':
        return 'Agent speaking';
    }
  })();

  const bgColor = (() => {
    switch (voiceState) {
      case 'IDLE':
        return theme.colors.gold;
      case 'LISTENING':
        return theme.colors.canvasRaised;
      case 'PROCESSING':
      case 'PLAYING':
        return theme.colors.goldDim;
    }
  })();

  const borderWidth = isActive ? 2 : 0;
  const borderColor = isActive ? theme.colors.gold : 'transparent';

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        selected: isActive,
        busy: isBusy,
      }}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: bgColor,
          borderWidth,
          borderColor,
          opacity: pressed ? 0.8 : 1,
          borderRadius: theme.radius.full,
          width: size,
          height: size,
        },
      ]}
    >
      {/* Typographic, not an emoji: DESIGN.md keeps iconography to glyphs so
          the surface reads as a terminal. A filled dot is the record mark —
          it says "capturing" without pulling in an icon font. */}
      <Text
        style={[
          styles.icon,
          {
            color: isActive ? theme.colors.gold : theme.colors.canvas,
            fontFamily: theme.fonts.bold,
            fontSize: size * 0.42,
          },
        ]}
      >
        ●
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    textAlign: 'center',
  },
});

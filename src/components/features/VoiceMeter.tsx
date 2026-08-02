import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

/**
 * The mic's decision, made visible.
 *
 * The VAD learns a noise floor from the room and treats anything clearing it
 * by a margin as speech. That is the right default, but it is invisible: when
 * the mic triggers on a fan, or misses a quiet voice, there is nothing on
 * screen to say which. This shows the live level against the threshold it is
 * being judged by, and lets the margin be nudged either way.
 *
 * It reports; it does not decide. The threshold shown is the VAD's own, so
 * the meter can never disagree with the thing that ends the turn.
 */

/** Bounds on the tunable margin — outside these the mic is deaf or stuck on. */
export const VAD_MARGIN_MIN = 0.04;
export const VAD_MARGIN_MAX = 0.35;
export const VAD_MARGIN_STEP = 0.02;
/** Tuned for a normal room; the starting point before any tweak. */
export const VAD_MARGIN_DEFAULT = 0.12;

type VoiceMeterProps = {
  /** Live input level, 0–1. */
  level: number;
  /** The level the VAD currently treats as speech, 0–1. */
  threshold: number;
  /** How far above the learned noise floor counts as speech. */
  margin: number;
  onMarginChange: (margin: number) => void;
  /**
   * Whether the mic is open. When it closes, the loudest level of the turn is
   * held rather than zeroed or trailing off — a turn ends BECAUSE the level
   * fell, so the last sample is always near silence and says nothing about
   * whether your voice was heard. The peak is the number worth reading.
   */
  listening: boolean;
  testID?: string;
};

const pct = (value: number): `${number}%` =>
  `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

export function VoiceMeter({
  level,
  threshold,
  margin,
  onMarginChange,
  listening,
  testID,
}: VoiceMeterProps) {
  const theme = useTheme();

  // The loudest level of the listening turn, kept in a ref so tracking it
  // costs no renders at the 10Hz sample rate, and promoted to state only when
  // the mic closes and it has to be displayed.
  const peak = useRef(0);
  const [held, setHeld] = useState(0);
  // Declared first so that on the commit where the mic closes it reads the
  // peak of the turn that just ended, before the tracker below resets it.
  useEffect(() => {
    if (listening) return;
    setHeld(peak.current);
  }, [listening]);
  useEffect(() => {
    // A new turn starts its own peak; during one, only rises count.
    peak.current = listening ? Math.max(peak.current, level) : 0;
  }, [listening, level]);

  const shown = listening ? level : held;
  const isSpeech = shown >= threshold;

  const nudge = (direction: -1 | 1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${direction === -1 ? 'Decrease' : 'Increase'} sensitivity margin`}
      onPress={() =>
        onMarginChange(
          direction === -1
            ? Math.max(VAD_MARGIN_MIN, Number((margin - VAD_MARGIN_STEP).toFixed(2)))
            : Math.min(VAD_MARGIN_MAX, Number((margin + VAD_MARGIN_STEP).toFixed(2))),
        )
      }
      hitSlop={8}
      style={{
        alignItems: 'center',
        borderColor: theme.colors.steel,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        height: 20,
        justifyContent: 'center',
        width: 20,
      }}
    >
      <Text
        style={{
          color: theme.colors.ink,
          fontFamily: theme.fonts.bold,
          fontSize: theme.type(12),
        }}
      >
        {direction === -1 ? '−' : '+'}
      </Text>
    </Pressable>
  );

  const caption = {
    color: theme.colors.inkMuted,
    fontFamily: theme.typography.mono.fontFamily,
    fontSize: theme.type(9),
  };

  return (
    <View
      testID={testID}
      accessibilityLabel="Microphone sensitivity meter"
      style={{
        backgroundColor: theme.colors.canvasRaised,
        borderColor: theme.colors.steel,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        gap: 6,
        padding: 8,
        width: 148,
      }}
    >
      {/* The bar: level as fill, threshold as a standing marker. */}
      <View
        style={{
          backgroundColor: theme.colors.canvas,
          borderRadius: 2,
          height: 8,
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <View
          testID="voice-meter-level"
          style={{
            backgroundColor: isSpeech ? theme.colors.ok : theme.colors.inkMuted,
            // Dimmed while held, so a frozen bar is never read as live input.
            opacity: listening ? 1 : 0.5,
            height: '100%',
            width: pct(shown),
          }}
        />
        <View
          testID="voice-meter-threshold"
          style={{
            backgroundColor: theme.colors.gold,
            bottom: 0,
            left: pct(threshold),
            position: 'absolute',
            top: 0,
            width: 2,
          }}
        />
      </View>

      <Text testID="voice-meter-verdict" style={caption}>
        {listening ? (isSpeech ? 'speech' : 'room noise') : 'peak held'}
      </Text>

      <Text style={caption}>
        {`${listening ? 'lvl' : 'pk'} ${shown.toFixed(2)}  thr ${threshold.toFixed(2)}`}
      </Text>

      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
        {nudge(-1)}
        <Text style={[caption, { flex: 1, textAlign: 'center' }]}>
          {`margin ${margin.toFixed(2)}`}
        </Text>
        {nudge(1)}
      </View>
    </View>
  );
}

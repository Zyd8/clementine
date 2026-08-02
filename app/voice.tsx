import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VoiceWaveform } from '@/components/features/VoiceWaveform';
import { useTheme } from '@/hooks/useTheme';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { useProfilesStore } from '@/stores/profiles';
import type { VoiceChatState } from '@/types/voice';

/**
 * The design labels three states; the hook machine has four. IDLE only exists
 * for the instant before the mic opens, and showing "idle" on a screen the
 * user opened *to talk* would read as broken, so it presents as listening.
 */
const LABELS: Record<VoiceChatState, string> = {
  IDLE: 'listening',
  LISTENING: 'listening',
  PROCESSING: 'thinking',
  PLAYING: 'speaking',
};

/**
 * Full-screen voice mode.
 *
 * Outside the tab group on purpose — the design hides the tab bar here, and
 * this screen owns the voice session. `useVoiceChat` keeps its machine in
 * component state, so exactly one mounted component may drive it; the chat
 * composer's mic now navigates here rather than starting a second, competing
 * session of its own.
 *
 * Runs go through the same Runs/SSE path as typed turns, which is why the
 * design promises the tool feed keeps streaming in chat behind this.
 */
export default function VoiceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const profileId = useProfilesStore((s) => s.activeProfileId)();
  const { voiceState, liveTranscript, audioLevel, tapMic } = useVoiceChat(profileId);

  // The user tapped a mic to get here; opening the screen *is* the tap.
  useEffect(() => {
    if (voiceState === 'IDLE') void tapMic();
    // Intentionally mount-only: re-running on every state change would
    // re-arm the mic the moment a turn finishes and IDLE comes back around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const thinking = voiceState === 'PROCESSING';
  const accent = thinking ? theme.colors.inkMuted : theme.colors.gold;

  const close = () => {
    // Cancels a recording or interrupts playback, depending on where the
    // machine is; IDLE needs no teardown.
    if (voiceState !== 'IDLE') void tapMic();
    router.back();
  };

  return (
    <View
      style={{
        backgroundColor: theme.colors.canvas,
        flex: 1,
        paddingBottom: insets.bottom,
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          padding: theme.spacing.md,
        }}
      >
        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(11),
            letterSpacing: 0.9,
          }}
        >
          VOICE MODE
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close voice mode"
          onPress={close}
          style={{ alignItems: 'center', height: 28, justifyContent: 'center', width: 28 }}
        >
          <Text
            style={{ color: theme.colors.inkMuted, fontSize: theme.type(18) }}
          >
            ×
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          alignItems: 'center',
          flex: 1,
          gap: 28,
          justifyContent: 'center',
          padding: theme.spacing.lg,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: accent,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(11),
            letterSpacing: 1.3,
            textTransform: 'uppercase',
          }}
        >
          {LABELS[voiceState]}
        </Text>

        <View
          testID="voice-ring"
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.canvasRaised,
            // Gold and thick while live, steel and thin while thinking — the
            // same focus language the rest of the app uses.
            borderColor: thinking ? theme.colors.steel : theme.colors.gold,
            borderRadius: theme.radius.full,
            borderWidth: thinking ? 1 : 2,
            height: 120,
            justifyContent: 'center',
            width: 120,
          }}
        >
          <VoiceWaveform
            level={audioLevel}
            isActive={!thinking}
            barCount={6}
            testID="voice-waveform"
          />
        </View>

        <Text
          style={{
            color: theme.colors.ink,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(14),
            lineHeight: theme.type(22),
            maxWidth: 300,
            minHeight: 64,
            textAlign: 'center',
          }}
        >
          {liveTranscript}
        </Text>

        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(10),
            letterSpacing: 0.7,
          }}
        >
          TOOL FEED STAYS LIVE IN CHAT
        </Text>
      </View>

      <View style={{ alignItems: 'center', padding: 20 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop and return"
          onPress={close}
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.full,
            borderWidth: 1,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(12),
              letterSpacing: 0.6,
            }}
          >
            STOP &amp; RETURN
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

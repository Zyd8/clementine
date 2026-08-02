import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VoiceMeter } from '@/components/features/VoiceMeter';
import { VoiceWaveform } from '@/components/features/VoiceWaveform';
import { useSyntheticSpeechLevel } from '@/hooks/useSyntheticSpeechLevel';
import { useTheme } from '@/hooks/useTheme';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { useProfilesStore } from '@/stores/profiles';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
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

/** What a tap on the ring does from each state — read by screen readers. */
const RING_LABELS: Record<VoiceChatState, string> = {
  IDLE: 'Start listening',
  LISTENING: 'Stop listening',
  PROCESSING: 'Thinking — nothing to interrupt yet',
  PLAYING: 'Interrupt and start listening',
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
  const { voiceState, liveTranscript, audioLevel, speechThreshold, voiceStatus, tapMic, leaveVoiceMode } =
    useVoiceChat(profileId);

  // Transcription is a cloud call now, so voice mode cannot start without a
  // key. Opening the mic anyway would record a clip, upload it, and fail —
  // better to say what is missing before anyone speaks into nothing.
  const asr = useVoiceProfileStore((s) => s.profile.asr);
  const vadNoiseMargin = useVoiceProfileStore((s) => s.profile.vadNoiseMargin);
  const setVadNoiseMargin = useVoiceProfileStore((s) => s.setVadNoiseMargin);
  const needsKey = !asr.keys[asr.provider];

  // The user tapped a mic to get here; opening the screen *is* the tap.
  useEffect(() => {
    if (!needsKey && voiceState === 'IDLE') void tapMic();
    // Mount-only: re-running on every state change would re-arm the mic the
    // moment a turn finishes and IDLE comes back around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const thinking = voiceState === 'PROCESSING';
  const playing = voiceState === 'PLAYING';
  const accent = thinking ? theme.colors.inkMuted : theme.colors.gold;

  // There is no real level to read for the AI's own voice — see the hook's
  // own comment — so the ring shows plausible motion while it speaks rather
  // than the user's (silent, mic-closed) level held over from before.
  const speakingLevel = useSyntheticSpeechLevel(playing);

  const close = () => {
    // Always a full stop: leaving the screen ends the exchange, it does not
    // hand the turn back for a follow-up the way tapping the ring mid-call
    // does. The AI must not keep talking into a screen the user just left.
    leaveVoiceMode();
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
            color: needsKey ? theme.colors.err : accent,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(11),
            letterSpacing: 1.3,
            textTransform: 'uppercase',
          }}
        >
          {needsKey ? 'voice needs a key' : LABELS[voiceState]}
        </Text>

        {/* The ring is the only affordance on this screen — no separate mic
            button. What a tap does depends on where the turn is: opens the
            mic from IDLE, cancels a recording from LISTENING, and cuts the
            reply off from PLAYING. Nothing to interrupt during PROCESSING,
            so it's inert then rather than silently swallowing a tap. */}
        <Pressable
          testID="voice-ring"
          accessibilityRole="button"
          accessibilityLabel={RING_LABELS[voiceState]}
          accessibilityState={{ disabled: thinking }}
          disabled={thinking}
          onPress={() => void tapMic()}
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.canvasRaised,
            // Gold and thick while live, steel and thin while thinking — the
            // same focus language the rest of the app uses.
            borderColor: thinking ? theme.colors.steel : theme.colors.gold,
            borderRadius: theme.radius.full,
            borderWidth: thinking ? 1 : 2,
            height: 176,
            justifyContent: 'center',
            width: 176,
          }}
        >
          <VoiceWaveform
            level={playing ? speakingLevel : audioLevel}
            isActive={!thinking}
            barCount={6}
            testID="voice-waveform"
          />
        </Pressable>

        <Text
          testID="voice-transcript"
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
          {needsKey
            ? `Speech-to-text runs through ${asr.provider}, which needs an API key. Add one under Settings → Voice.`
            : liveTranscript}
        </Text>

        {/* What the pipeline is doing right now — mic open, transcribing,
            sending, speaking — or the exact error when a step fails. This is
            the "is it working?" answer, so it is always visible and reads as
            status, not as a transcript. */}
        {voiceStatus !== '' ? (
          <Text
            testID="voice-status"
            accessibilityLiveRegion="polite"
            style={{
              color: theme.colors.gold,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.type(11),
              lineHeight: theme.type(17),
              maxWidth: 300,
              textAlign: 'center',
            }}
          >
            {voiceStatus}
          </Text>
        ) : null}

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

        {/* Tapping the ring already interrupts, but nothing on screen said
            so. A clearly-sized stop button below makes it discoverable
            while the reply plays, which is the only state where
            interrupting is possible. Faint red rather than solid — this is
            an option sitting under the reply, not an alarm. */}
        {playing ? (
          <Pressable
            testID="voice-interrupt-button"
            accessibilityRole="button"
            accessibilityLabel="Interrupt and start listening"
            onPress={() => void tapMic()}
            hitSlop={8}
            style={{
              alignItems: 'center',
              backgroundColor: `${theme.colors.err}26`,
              borderColor: `${theme.colors.err}66`,
              borderRadius: theme.radius.full,
              borderWidth: 1,
              height: 56,
              justifyContent: 'center',
              width: 56,
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.err,
                borderRadius: 3,
                height: 18,
                width: 18,
              }}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Bottom-left: what the mic is actually deciding, and the one knob
          that changes it. Defaults are tuned — this is for when a room
          disagrees with them. */}
      <View style={{ paddingHorizontal: 20 }}>
        <VoiceMeter
          level={audioLevel}
          threshold={speechThreshold}
          margin={vadNoiseMargin}
          onMarginChange={(margin) => void setVadNoiseMargin(margin)}
          listening={voiceState === 'LISTENING'}
          testID="voice-meter"
        />
      </View>
    </View>
  );
}

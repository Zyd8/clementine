import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { useTheme } from '@/hooks/useTheme';
import { useBudgetStore } from '@/stores/budget';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore, type ThemePreference } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import type { AsrProviderConfig, TtsProviderConfig } from '@/types/voice';

const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

const ASR_OPTIONS: readonly { value: AsrProviderConfig['provider']; label: string }[] = [
  { value: 'groq', label: 'Groq Whisper (free tier)' },
  { value: 'deepgram', label: 'Deepgram streaming' },
  { value: 'openai', label: 'OpenAI Whisper' },
];

const TTS_OPTIONS: readonly { value: TtsProviderConfig['provider']; label: string }[] = [
  { value: 'device', label: 'On-device voice (free, offline)' },
  { value: 'edge', label: 'Edge TTS (free)' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'minimax', label: 'MiniMax' },
];

/**
 * Settings: theme, the two voice provider pickers, and the daily budget.
 *
 * The theme control moved here from the chat header — the design gives it a
 * row of its own showing all three states, rather than a one-label toggle
 * that took two taps to discover. Provider API keys still live on
 * `/voice-profile`; this screen only picks which provider is active, which is
 * what the design draws.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const screenRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(screenRef);

  const preference = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const voiceProfile = useVoiceProfileStore((s) => s.profile);
  const updateAsrConfig = useVoiceProfileStore((s) => s.updateAsrConfig);
  const updateTtsConfig = useVoiceProfileStore((s) => s.updateTtsConfig);

  const connection = useConnectionStore((s) => s.connection);
  const dailyLimit = useBudgetStore((s) => s.dailyLimit);
  const setLimit = useBudgetStore((s) => s.setLimit);
  const [budgetDraft, setBudgetDraft] = useState(String(dailyLimit));

  const onBudgetChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setBudgetDraft(digits);
    void setLimit(Number.parseInt(digits, 10) || 0);
  };

  const sectionLabel = (text: string) => (
    <Text
      style={{
        color: theme.colors.inkMuted,
        fontFamily: theme.fonts.regular,
        fontSize: theme.type(10.5),
        letterSpacing: 0.8,
      }}
    >
      {text}
    </Text>
  );

  const optionRow = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      testID={`option-${key}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.canvasRaised,
        borderColor: selected ? theme.colors.gold : theme.colors.steel,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: selected ? theme.colors.gold : theme.colors.inkMuted,
          fontFamily: theme.fonts.regular,
          fontSize: theme.type(12.5),
        }}
      >
        {label}
      </Text>
      {selected ? (
        <Text style={{ color: theme.colors.gold, fontSize: theme.type(11) }}>●</Text>
      ) : null}
    </Pressable>
  );

  return (
    <View
      ref={screenRef}
      style={{
        backgroundColor: theme.colors.canvas,
        flex: 1,
        // Ends the scroll viewport at the keyboard's top edge. Padding the
        // content alone leaves the viewport under the keyboard, so nothing
        // the user scrolls to is actually visible.
        paddingBottom: keyboardOverlap,
      }}
    >
      <View
        style={{
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 14,
        }}
      >
        <Text
          style={{
            color: theme.colors.ink,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type(13),
            letterSpacing: 0.5,
          }}
        >
          SETTINGS
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 22, padding: theme.spacing.md, paddingBottom: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel('THEME')}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {THEME_OPTIONS.map((option) => {
              const active = option === preference;
              return (
                <Pressable
                  key={option}
                  testID={`theme-${option}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => void setTheme(option)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: active
                      ? theme.colors.gold
                      : theme.colors.canvasRaised,
                    borderColor: active ? theme.colors.gold : theme.colors.steel,
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    flex: 1,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.canvas : theme.colors.inkMuted,
                      fontFamily: theme.fonts.regular,
                      fontSize: theme.type(11.5),
                    }}
                  >
                    {option.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel('VOICE — SPEECH-TO-TEXT')}
          <View style={{ gap: 6 }}>
            {ASR_OPTIONS.map(({ value, label }) =>
              optionRow(`asr-${value}`, label, voiceProfile.asr.provider === value, () =>
                void updateAsrConfig({ provider: value }),
              ),
            )}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel('VOICE — TEXT-TO-SPEECH')}
          <View style={{ gap: 6 }}>
            {TTS_OPTIONS.map(({ value, label }) =>
              optionRow(`tts-${value}`, label, voiceProfile.tts.provider === value, () =>
                void updateTtsConfig({ provider: value }),
              ),
            )}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel(`BUDGET — ${connection?.name ?? 'no instance'}`)}
          <View
            style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
          >
            <TextInput
              aria-label="Daily token budget"
              value={budgetDraft}
              onChangeText={onBudgetChange}
              keyboardType="number-pad"
              style={{
                backgroundColor: theme.colors.canvasRaised,
                borderColor: theme.colors.steel,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                color: theme.colors.ink,
                flex: 1,
                fontFamily: theme.fonts.regular,
                fontSize: theme.type(13),
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            />
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.fonts.regular,
                fontSize: theme.type(11),
              }}
            >
              tok / day
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(10.5),
            }}
          >
            non-blocking warning only — the app can&apos;t cap what the server does
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

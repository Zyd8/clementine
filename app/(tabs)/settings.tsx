import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { ProviderPicker } from '@/components/features/ProviderPicker';
import { Stepper } from '@/components/ui/Stepper';
import { useTheme } from '@/hooks/useTheme';
import { useBudgetStore } from '@/stores/budget';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore, type ThemePreference } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import type { ProviderOption } from '@/components/features/ProviderPicker';
import type {
  AsrProviderConfig,
  InterruptBehavior,
  TtsProviderConfig,
} from '@/types/voice';

const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

const ASR_OPTIONS: readonly ProviderOption<AsrProviderConfig['provider']>[] = [
  { value: 'groq', label: 'Groq Whisper (free tier)' },
  { value: 'deepgram', label: 'Deepgram streaming' },
  { value: 'openai', label: 'OpenAI Whisper' },
];

/** Neither the phone's own engine nor Edge's free endpoint takes a key. */
/** What happens to a spoken reply when the user talks over it. */
const INTERRUPT_OPTIONS: readonly { value: InterruptBehavior; label: string }[] = [
  { value: 'stop_speech_and_run', label: 'Stop speaking and cancel the run' },
  { value: 'stop_speech_only', label: 'Stop speaking, let the run finish' },
];

const TTS_OPTIONS: readonly ProviderOption<TtsProviderConfig['provider']>[] = [
  { value: 'device', label: 'On-device voice (free, offline)', keyless: true },
  { value: 'edge', label: 'Edge TTS (free)', keyless: true },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'minimax', label: 'MiniMax' },
];

/**
 * Settings: theme, the two voice provider pickers, and the daily budget.
 *
 * The theme control moved here from the chat header — the design gives it a
 * row of its own showing all three states, rather than a one-label toggle
 * that took two taps to discover.
 *
 * Every voice setting lives here, in one screen. Key entry opens inside the
 * provider row it belongs to, so picking a provider and being asked for its
 * key is one action. There was a second screen (`/voice-profile`) holding the
 * keys and timings; it became unreachable when the tab bar replaced the
 * header nav, and splitting voice settings across two places was the reason
 * a picked provider could end up with nowhere to put its key.
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
  const setProfile = useVoiceProfileStore((s) => s.setProfile);

  const connection = useConnectionStore((s) => s.connection);
  const dailyLimit = useBudgetStore((s) => s.dailyLimit);
  const setLimit = useBudgetStore((s) => s.setLimit);
  const [budgetDraft, setBudgetDraft] = useState(String(dailyLimit));

  // Keys are held locally while typing and written straight through, so a
  // half-typed key is never what the provider is called with.
  const [asrKey, setAsrKey] = useState(voiceProfile.asr.apiKey ?? '');
  const [ttsKey, setTtsKey] = useState(voiceProfile.tts.apiKey ?? '');

  const onAsrKeyChange = (apiKey: string) => {
    setAsrKey(apiKey);
    void updateAsrConfig({ apiKey });
  };

  const onTtsKeyChange = (apiKey: string) => {
    setTtsKey(apiKey);
    void updateTtsConfig({ apiKey });
  };

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
          <ProviderPicker
            options={ASR_OPTIONS}
            selected={voiceProfile.asr.provider}
            onSelect={(provider) => void updateAsrConfig({ provider })}
            keyLabel="ASR API Key"
            apiKey={asrKey}
            onApiKeyChange={onAsrKeyChange}
            testIDPrefix="asr"
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel('VOICE — TEXT-TO-SPEECH')}
          <ProviderPicker
            options={TTS_OPTIONS}
            selected={voiceProfile.tts.provider}
            onSelect={(provider) => void updateTtsConfig({ provider })}
            keyLabel="TTS API Key"
            apiKey={ttsKey}
            onApiKeyChange={onTtsKeyChange}
            testIDPrefix="tts"
          />
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {sectionLabel('VOICE — TIMING')}
          <Stepper
            label="END OF SPEECH"
            value={voiceProfile.endOfSpeechTimeoutMs}
            step={100}
            min={300}
            max={3000}
            onChange={(endOfSpeechTimeoutMs) =>
              void setProfile({ ...voiceProfile, endOfSpeechTimeoutMs })
            }
            unit="ms"
          />
          <Stepper
            label="MAX RECORDING"
            value={voiceProfile.maxRecordingMs}
            step={15_000}
            min={15_000}
            max={300_000}
            onChange={(maxRecordingMs) =>
              void setProfile({ ...voiceProfile, maxRecordingMs })
            }
            unit="ms"
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {sectionLabel('VOICE — ON INTERRUPT')}
          <View style={{ gap: 6 }}>
            {INTERRUPT_OPTIONS.map(({ value, label }) =>
              optionRow(`interrupt-${value}`, label, voiceProfile.interruptBehavior === value, () =>
                void setProfile({ ...voiceProfile, interruptBehavior: value }),
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

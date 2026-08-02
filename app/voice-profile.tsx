import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useTheme } from '@/hooks/useTheme';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import type { AsrProviderConfig, TtsProviderConfig } from '@/types/voice';

const ASR_PROVIDERS: AsrProviderConfig['provider'][] = [
  'whisper_cpp',
  'groq',
  'deepgram',
  'openai',
];
const TTS_PROVIDERS: TtsProviderConfig['provider'][] = [
  'edge',
  'elevenlabs',
  'openai',
  'minimax',
];

/** KISS: simple +/- stepper for numeric settings. */
function Stepper({
  label,
  value,
  step,
  min,
  max,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
      <Text
        style={{
          color: theme.colors.inkMuted,
          fontFamily: theme.typography.mono.fontFamily,
          fontSize: theme.typography.mono.fontSize,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityLabel={`Decrease ${label}`}
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderRadius: theme.radius.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontFamily: theme.typography.mono.fontFamily }}>
            −
          </Text>
        </Pressable>
        <Text
          style={{
            color: theme.colors.gold,
            fontFamily: theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize,
            minWidth: 80,
            textAlign: 'center',
          }}
        >
          {value}
          {unit}
        </Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityLabel={`Increase ${label}`}
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderRadius: theme.radius.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontFamily: theme.typography.mono.fontFamily }}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function VoiceProfileScreen() {
  const theme = useTheme();
  const profile = useVoiceProfileStore((s) => s.profile);
  const updateAsr = useVoiceProfileStore((s) => s.updateAsrConfig);
  const updateTts = useVoiceProfileStore((s) => s.updateTtsConfig);

  const [asrKey, setAsrKey] = useState(profile.asr.apiKey ?? '');
  const [ttsKey, setTtsKey] = useState(profile.tts.apiKey ?? '');
  const [ttsVoiceId, setTtsVoiceId] = useState(profile.tts.voiceId ?? '');
  const [eosMs, setEosMs] = useState(profile.endOfSpeechTimeoutMs);
  const [maxRecMs, setMaxRecMs] = useState(profile.maxRecordingMs);

  const save = async () => {
    await updateAsr({ apiKey: asrKey || undefined });
    await updateTts({ apiKey: ttsKey || undefined, voiceId: ttsVoiceId || undefined });
    // Persist numeric settings via the full profile update
    await useVoiceProfileStore.getState().setProfile({
      ...useVoiceProfileStore.getState().profile,
      endOfSpeechTimeoutMs: eosMs,
      maxRecordingMs: maxRecMs,
    });
    router.back();
  };

  return (
    <ScrollView
      contentContainerStyle={{
        backgroundColor: theme.colors.canvas,
        flexGrow: 1,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
      }}
    >
      {/* ASR provider picker */}
      <Text
        style={{
          color: theme.colors.ink,
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize,
        }}
      >
        Speech Recognition
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {ASR_PROVIDERS.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => updateAsr({ provider })}
            accessibilityLabel={`ASR provider ${provider}`}
            accessibilityState={{ selected: profile.asr.provider === provider }}
            style={{
              backgroundColor:
                profile.asr.provider === provider
                  ? theme.colors.gold
                  : theme.colors.canvasRaised,
              borderRadius: theme.radius.sm,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Text
              style={{
                color:
                  profile.asr.provider === provider
                    ? theme.colors.canvas
                    : theme.colors.ink,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.typography.mono.fontSize,
              }}
            >
              {provider.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* BYO ASR key — not needed for whisper_cpp */}
      {profile.asr.provider !== 'whisper_cpp' && (
        <Field
          label="ASR API Key"
          value={asrKey}
          onChangeText={setAsrKey}
          placeholder="sk-..."
          secret
        />
      )}

      {/* TTS provider picker */}
      <Text
        style={{
          color: theme.colors.ink,
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize,
          marginTop: theme.spacing.md,
        }}
      >
        Text-to-Speech
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {TTS_PROVIDERS.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => updateTts({ provider })}
            accessibilityLabel={`TTS provider ${provider}`}
            accessibilityState={{ selected: profile.tts.provider === provider }}
            style={{
              backgroundColor:
                profile.tts.provider === provider
                  ? theme.colors.gold
                  : theme.colors.canvasRaised,
              borderRadius: theme.radius.sm,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Text
              style={{
                color:
                  profile.tts.provider === provider
                    ? theme.colors.canvas
                    : theme.colors.ink,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.typography.mono.fontSize,
              }}
            >
              {provider.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* BYO TTS key — not needed for edge */}
      {profile.tts.provider !== 'edge' && (
        <>
          <Field
            label="TTS API Key"
            value={ttsKey}
            onChangeText={setTtsKey}
            placeholder="sk-..."
            secret
          />
          <Field
            label="Voice ID"
            value={ttsVoiceId}
            onChangeText={setTtsVoiceId}
            placeholder="voice_..."
          />
        </>
      )}

      {/* Timing controls */}
      <Text
        style={{
          color: theme.colors.ink,
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize,
          marginTop: theme.spacing.md,
        }}
      >
        Timing
      </Text>
      <Stepper
        label="End of speech timeout"
        value={eosMs}
        step={100}
        min={100}
        max={5000}
        onChange={setEosMs}
        unit="ms"
      />
      <Stepper
        label="Max recording duration"
        value={maxRecMs}
        step={5000}
        min={1000}
        max={300000}
        onChange={setMaxRecMs}
        unit="ms"
      />

      <Button label="SAVE" onPress={save} />
    </ScrollView>
  );
}

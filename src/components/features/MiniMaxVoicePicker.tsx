import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { useTheme } from '@/hooks/useTheme';
import {
  DEFAULT_MINIMAX_VOICE,
  MINIMAX_VOICES,
} from '@/constants/minimaxVoices';

type MiniMaxVoicePickerProps = {
  /**
   * The profile's stored voiceId. Empty means "provider default"; it may
   * also be a custom/cloned voice id that is not in the system list.
   */
  value: string;
  onChange: (voiceId: string) => void;
  testIDPrefix?: string;
};

const CUSTOM_LABEL = 'Custom voice ID';

/**
 * MiniMax voice selection, drawn under the provider's API key field.
 *
 * One radio row per system voice, plus a Custom row that opens a text box
 * for a cloned/generated voice id the API accepts but this list cannot know.
 * The highlighted row is the voice that will actually be spoken: an empty
 * stored value resolves to the provider default, and a stored id that is not
 * a system voice resolves to the Custom row with the field pre-filled.
 */
export function MiniMaxVoicePicker({
  value,
  onChange,
  testIDPrefix = 'minimax-voice',
}: MiniMaxVoicePickerProps) {
  const theme = useTheme();
  // Opening the Custom row is a user action, not derivable from the value:
  // tapping it with an empty stored id must still open the field.
  const [customOpen, setCustomOpen] = useState(false);

  const effective = value || DEFAULT_MINIMAX_VOICE;
  const custom = value !== '' && !MINIMAX_VOICES.some((v) => v.id === effective);
  const showCustomField = customOpen || custom;

  const row = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      testID={`${testIDPrefix}-${key}`}
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
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          color: selected ? theme.colors.gold : theme.colors.inkMuted,
          fontFamily: theme.fonts.regular,
          fontSize: theme.type(12),
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
    <View style={{ gap: 6, marginTop: theme.spacing.md }}>
      <Text
        style={{
          color: theme.colors.inkMuted,
          fontFamily: theme.fonts.regular,
          fontSize: theme.type(10.5),
          letterSpacing: 0.8,
        }}
      >
        MINIMAX VOICE
      </Text>

      {MINIMAX_VOICES.map((voice) =>
        row(voice.id, voice.label, voice.id === effective, () => {
          setCustomOpen(false);
          onChange(voice.id);
        }),
      )}

      {row('custom', CUSTOM_LABEL, showCustomField, () => setCustomOpen(true))}

      {showCustomField ? (
        <View style={{ paddingTop: 2 }}>
          <Field
            label={CUSTOM_LABEL}
            value={value}
            onChangeText={onChange}
            placeholder="e.g. a cloned voice id"
          />
        </View>
      ) : null}
    </View>
  );
}

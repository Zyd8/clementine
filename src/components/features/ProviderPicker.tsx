import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Field } from '@/components/ui/Field';
import { useTheme } from '@/hooks/useTheme';

export type ProviderOption<T extends string> = {
  value: T;
  label: string;
  /** Free providers that authenticate with nothing. */
  keyless?: boolean;
};

type ProviderPickerProps<T extends string> = {
  options: readonly ProviderOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** Field label for the key, e.g. "ASR API Key". */
  keyLabel: string;
  /** One key per provider — switching must not carry the previous one over. */
  keys: Record<string, string>;
  onKeyChange: (provider: T, value: string) => void;
  testIDPrefix: string;
};

/**
 * A provider list where the selected row opens to reveal its key entry.
 *
 * The key belongs to one provider, so it is drawn inside that provider's row
 * rather than in a section of its own — picking a provider and being asked
 * for its key is one action, and a key field floating below an unrelated list
 * gives no clue which provider it authenticates.
 *
 * Keyless providers open to nothing: there is no field to show, and an empty
 * expander would imply something is missing.
 */
export function ProviderPicker<T extends string>({
  options,
  selected,
  onSelect,
  keyLabel,
  keys,
  onKeyChange,
  testIDPrefix,
}: ProviderPickerProps<T>) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      {options.map(({ value, label, keyless }) => {
        const active = value === selected;
        const expanded = active && !keyless;

        return (
          <View
            key={value}
            testID={`${testIDPrefix}-${value}-row`}
            style={{
              backgroundColor: theme.colors.canvasRaised,
              borderColor: active ? theme.colors.gold : theme.colors.steel,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              overflow: 'hidden',
            }}
          >
            <Pressable
              testID={`${testIDPrefix}-${value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, expanded }}
              onPress={() => onSelect(value)}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.sm,
                justifyContent: 'space-between',
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.gold : theme.colors.inkMuted,
                  flex: 1,
                  fontFamily: theme.fonts.regular,
                  fontSize: theme.type(12.5),
                }}
              >
                {label}
              </Text>
              {active ? (
                <Text style={{ color: theme.colors.gold, fontSize: theme.type(11) }}>
                  {keyless ? '●' : '▾'}
                </Text>
              ) : null}
            </Pressable>

            {expanded ? (
              <View
                testID={`${testIDPrefix}-${value}-key`}
                style={{
                  borderTopColor: theme.colors.steel,
                  borderTopWidth: 1,
                  padding: 12,
                }}
              >
                <Field
                  label={keyLabel}
                  value={keys[value] ?? ''}
                  onChangeText={(next) => onKeyChange(value, next)}
                  placeholder="paste the provider's key"
                  secret
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

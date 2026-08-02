import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore, type ThemePreference } from '@/stores/settings';

const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

/**
 * Settings.
 *
 * The theme control moves here from the chat header — the design gives it a
 * three-up row of its own, and the header now belongs to the endpoint
 * identity. ASR/TTS provider pickers and the daily budget are the design's
 * other two sections; the providers already have a screen
 * (`/voice-profile`), so this links to it rather than duplicating the
 * pickers.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const preference = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const label = (text: string) => (
    <Text
      style={{
        color: theme.colors.inkMuted,
        fontFamily: theme.fonts.regular,
        fontSize: 10.5,
        letterSpacing: 0.8,
      }}
    >
      {text}
    </Text>
  );

  return (
    <View style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
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
            fontSize: 13,
            letterSpacing: 0.5,
          }}
        >
          SETTINGS
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 22, padding: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.sm }}>
          {label('THEME')}
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
                      ? theme.colors.canvasRaised
                      : 'transparent',
                    borderColor: active ? theme.colors.gold : theme.colors.steel,
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    flex: 1,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.gold : theme.colors.inkMuted,
                      fontFamily: theme.fonts.regular,
                      fontSize: 11.5,
                    }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {label('VOICE')}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/voice-profile')}
            style={{
              backgroundColor: theme.colors.canvasRaised,
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: theme.colors.ink,
                fontFamily: theme.fonts.regular,
                fontSize: 12.5,
              }}
            >
              speech-to-text & text-to-speech providers
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {label('CONNECTION')}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/setup')}
            style={{
              backgroundColor: theme.colors.canvasRaised,
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                color: theme.colors.ink,
                fontFamily: theme.fonts.regular,
                fontSize: 12.5,
              }}
            >
              reconfigure hermes instance
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

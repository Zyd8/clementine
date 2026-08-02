import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { TabKey } from '@/utils/tabs';

export type { TabKey };

type Tab = { key: TabKey; glyph: string; label: string };

/**
 * The four tabs, in the design's order.
 *
 * Glyphs are typographic on purpose — DESIGN.md's Assets note keeps
 * iconography to characters (`>_`, `≡`, `◆`, `⚙`) so the chrome reads as a
 * terminal rather than a phone app.
 */
export const TABS: readonly Tab[] = [
  { key: 'index', glyph: '>_', label: 'CHAT' },
  { key: 'sessions', glyph: '≡', label: 'SESSIONS' },
  { key: 'profiles', glyph: '◆', label: 'PROFILES' },
  { key: 'settings', glyph: '⚙', label: 'SETTINGS' },
];

type TabBarProps = {
  activeKey: TabKey;
  onSelect: (key: TabKey) => void;
};

/**
 * Bottom tab bar.
 *
 * The active tab wears a 2px gold top border and gold text; the rest are
 * muted with a transparent border of the same width, so switching tabs never
 * shifts the row by a pixel. That is the gold/steel focus language applied to
 * navigation: the tab you are on is the live one.
 */
export function TabBar({ activeKey, onSelect }: TabBarProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        backgroundColor: theme.colors.canvas,
        borderTopColor: theme.colors.steel,
        borderTopWidth: 1,
        flexDirection: 'row',
      }}
    >
      {TABS.map(({ key, glyph, label }) => {
        const active = key === activeKey;
        const color = active ? theme.colors.gold : theme.colors.inkMuted;

        return (
          <Pressable
            key={key}
            testID={`tab-${key}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(key)}
            style={{
              alignItems: 'center',
              borderTopColor: active ? theme.colors.gold : 'transparent',
              borderTopWidth: 2,
              flex: 1,
              gap: theme.spacing.xs,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color, fontFamily: theme.fonts.regular, fontSize: 12 }}>
              {glyph}
            </Text>
            <Text
              style={{
                color,
                fontFamily: theme.fonts.regular,
                fontSize: 9,
                letterSpacing: 0.5,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type AvatarProps = {
  /** Two characters, already normalised by the profiles store. */
  initials: string;
  size?: number;
  /** Gold ring for the live profile, steel for the rest. */
  active?: boolean;
  testID?: string;
};

/**
 * The profile mark: a ringed circle of initials.
 *
 * Deliberately a ring rather than a filled disc — gold fill means "tap me"
 * elsewhere in this app (send, mic), and an avatar is an indicator, not a
 * control. Font scales with the circle so a 22px chip and a 34px row entry
 * read the same.
 */
export function Avatar({ initials, size = 26, active = true, testID }: AvatarProps) {
  const theme = useTheme();
  const accent = active ? theme.colors.gold : theme.colors.inkMuted;

  return (
    <View
      testID={testID}
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.canvas,
        borderColor: active ? theme.colors.gold : theme.colors.steel,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        flexShrink: 0,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Text
        style={{
          color: accent,
          fontFamily: theme.fonts.bold,
          fontSize: size * 0.38,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

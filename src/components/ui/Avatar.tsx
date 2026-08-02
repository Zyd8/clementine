import React from 'react';
import { Image, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type AvatarProps = {
  /** Two characters, or a local image URI (`file://…`) for an uploaded avatar. */
  initials: string;
  size?: number;
  /** Gold ring for the live profile, steel for the rest. */
  active?: boolean;
  testID?: string;
};

/** A `file://` URI is an uploaded avatar image; anything else is initials. */
const isImageUri = (value: string): boolean => value.startsWith('file://');

/**
 * The profile mark: a ringed circle of initials, or the profile's locally
 * saved avatar image once one has been uploaded.
 *
 * Deliberately a ring rather than a filled disc — gold fill means "tap me"
 * elsewhere in this app (send, mic), and an avatar is an indicator, not a
 * control. The ring and the gold/steel accent stay identical for both the
 * initials and image forms so the two states read as one component.
 */
export function Avatar({ initials, size = 34, active = true, testID }: AvatarProps) {
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
        overflow: 'hidden',
        width: size,
      }}
    >
      {isImageUri(initials) ? (
        <Image
          source={{ uri: initials }}
          accessibilityLabel="Profile avatar image"
          style={{ height: size, width: size }}
        />
      ) : (
        <Text
          style={{
            color: accent,
            fontFamily: theme.fonts.bold,
            fontSize: size * 0.38,
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

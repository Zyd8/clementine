import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';

/**
 * Profiles — accounts within the one connected Hermes instance.
 *
 * The design draws editable avatar/name rows and a SELECT control per
 * profile. Only the default profile exists today: `plan/03-profiles.md`
 * records profile switching as parked after the backend was verified on
 * 2026-08-02 (`/v1/profiles` → 404, no `profiles` capability flag), because
 * the host runs a single profile. So the list renders the one real profile
 * and says why there is only one, rather than showing controls that would
 * switch to nothing.
 *
 * DISCONNECT is live — it is the design's footer action and the connection
 * store already implements it.
 */
export default function ProfilesScreen() {
  const theme = useTheme();
  const connection = useConnectionStore((s) => s.connection);
  const disconnect = useConnectionStore((s) => s.disconnect);

  return (
    <View style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
      <View
        style={{
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          gap: theme.spacing.xs,
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
          PROFILES
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: 11,
          }}
        >
          {connection
            ? `${connection.name} · ${connection.baseUrl}`
            : 'no hermes connected'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 10, padding: theme.spacing.md }}>
        <View
          testID="profile-row"
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.gold,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.canvas,
              borderColor: theme.colors.gold,
              borderRadius: theme.radius.full,
              borderWidth: 1,
              height: 34,
              justifyContent: 'center',
              width: 34,
            }}
          >
            <Text
              style={{
                color: theme.colors.gold,
                fontFamily: theme.fonts.bold,
                fontSize: 11,
              }}
            >
              DF
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.ink,
              flex: 1,
              fontFamily: theme.fonts.regular,
              fontSize: 13,
            }}
          >
            default
          </Text>
          <Text
            style={{
              color: theme.colors.gold,
              fontFamily: theme.fonts.bold,
              fontSize: 10,
              letterSpacing: 0.4,
            }}
          >
            ACTIVE
          </Text>
        </View>

        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: 10.5,
            lineHeight: 16,
            paddingHorizontal: 2,
          }}
        >
          this hermes runs a single profile — switching activates when the host
          enables multiplexing and a second profile exists
        </Text>

        {connection ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Disconnect hermes instance"
            onPress={() => void disconnect()}
            style={{
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.md,
              borderStyle: 'dashed',
              borderWidth: 1,
              marginTop: 6,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.fonts.regular,
                fontSize: 11.5,
                textAlign: 'center',
              }}
            >
              DISCONNECT HERMES INSTANCE
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

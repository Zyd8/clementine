import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { SessionRow } from '@/components/features/SessionRow';
import { Avatar } from '@/components/ui/Avatar';
import { useSessions } from '@/hooks/useSessions';
import { useTheme } from '@/hooks/useTheme';
import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';

/**
 * Session list for the current connection/profile. Tap a row to resume it
 * (loads history into the chat store and returns to the chat screen); FORK
 * branches it server-side and refreshes the list. NEW SESSION creates a
 * fresh session and opens it.
 */
export default function SessionsScreen() {
  const theme = useTheme();
  const { sessions, isLoading, error, resumingSessionId, resume, fork, refresh, startNew } =
    useSessions();

  const connection = useConnectionStore((s) => s.connection);
  const profiles = useProfilesStore((s) => s.profiles);
  const activeId = useProfilesStore((s) => s.activeId);
  const activeProfile = profiles.find((p) => p.id === activeId);

  const onTap = (sessionId: string) => {
    void resume(sessionId).then(() => router.push('/'));
  };

  const onNewSession = () => {
    void startNew().then(() => router.push('/'));
  };

  return (
    <View style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
      {/* Title + active profile above, endpoint and NEW SESSION below —
          the design's sessions header, which the tab bar now leaves room for. */}
      <View
        style={{
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
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
            SESSIONS
          </Text>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
            <Avatar initials={activeProfile?.avatar ?? 'DF'} size={22} />
            <Text
              style={{
                color: theme.colors.ink,
                fontFamily: theme.fonts.semibold,
                fontSize: theme.type(11.5),
              }}
            >
              {activeProfile?.name ?? 'default'}
            </Text>
          </View>
        </View>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.inkMuted,
              flex: 1,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(11),
            }}
          >
            {connection?.name ?? 'no hermes connected'}
          </Text>
          <Pressable onPress={onNewSession}>
            <Text
              style={{
                color: theme.colors.gold,
                fontFamily: theme.fonts.bold,
                fontSize: theme.type(11),
                letterSpacing: 0.4,
              }}
            >
              NEW SESSION
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={{ padding: theme.spacing.md }}>
          <Text
            style={{
              color: theme.colors.ink,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: theme.typography.body.fontSize,
            }}
          >
            {error}
          </Text>
          <Pressable onPress={() => void refresh()} style={{ marginTop: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.gold,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.typography.mono.fontSize,
              }}
            >
              RETRY
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refresh()}
              tintColor={theme.colors.gold}
            />
          }
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              onTap={onTap}
              onFork={(sessionId) => void fork(sessionId)}
              isResuming={resumingSessionId === item.id}
            />
          )}
          ListEmptyComponent={
            !isLoading ? (
              <Text
                style={{
                  color: theme.colors.inkMuted,
                  fontFamily: theme.typography.mono.fontFamily,
                  fontSize: theme.typography.mono.fontSize,
                  padding: theme.spacing.md,
                  textAlign: 'center',
                }}
              >
                NO SESSIONS YET
              </Text>
            ) : null
          }
          contentContainerStyle={{ gap: theme.spacing.xs }}
        />
      )}
    </View>
  );
}

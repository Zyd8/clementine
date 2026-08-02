import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { SessionRow } from '@/components/features/SessionRow';
import { useSessions } from '@/hooks/useSessions';
import { useTheme } from '@/hooks/useTheme';

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

  const onTap = (sessionId: string) => {
    void resume(sessionId).then(() => router.push('/'));
  };

  const onNewSession = () => {
    void startNew().then(() => router.push('/'));
  };

  return (
    <View style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
      {/* Header with NEW SESSION button */}
      <View
        style={{
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          padding: theme.spacing.md,
        }}
      >
        <Pressable onPress={onNewSession}>
          <Text
            style={{
              color: theme.colors.gold,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
              fontWeight: '700',
            }}
          >
            NEW SESSION
          </Text>
        </Pressable>
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

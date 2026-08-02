import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ToolCallCard } from '@/components/features/ToolCallCard';
import { Bubble } from '@/components/ui/Bubble';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';
import { useChatStore, type FeedItem } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';

/**
 * The chat surface: a terminal scrollback where user turns, agent turns and
 * tool lines interleave. Thin by design — `useChat` owns the turn lifecycle.
 */
export default function ChatScreen() {
  const theme = useTheme();
  const connection = useConnectionStore((s) => s.connection);
  const feed = useChatStore((s) => s.feed(null));
  const usage = useChatStore((s) => s.usage(null));
  const { send, stop, isStreaming } = useChat();
  const [draft, setDraft] = useState('');

  const onSend = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  const renderItem = ({ item }: { item: FeedItem }) => {
    if (item.kind === 'tool') {
      return (
        <ToolCallCard
          tool={item.tool}
          args={item.args}
          status={item.status}
          {...(item.durationMs === undefined ? {} : { durationMs: item.durationMs })}
        />
      );
    }
    return (
      <Bubble
        role={item.kind === 'error' ? 'error' : item.kind}
        text={item.text}
        {...(item.kind === 'assistant' ? { streaming: item.streaming } : {})}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ backgroundColor: theme.colors.canvas, flex: 1 }}
    >
      <View
        style={{
          alignItems: 'center',
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
        }}
      >
        {/* Gold while the agent is working, steel when idle — the whole
            design language in one 8px dot. */}
        <View
          accessibilityLabel={isStreaming ? 'Agent is working' : 'Idle'}
          style={{
            backgroundColor: isStreaming ? theme.colors.gold : theme.colors.steel,
            borderRadius: theme.radius.full,
            height: 8,
            width: 8,
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.ink,
            flex: 1,
            fontFamily: theme.typography.mono.fontFamily,
            fontSize: theme.typography.mono.fontSize,
          }}
        >
          {connection?.name ?? connection?.baseUrl ?? 'NOT CONNECTED'}
        </Text>
        <Pressable onPress={() => router.push('/sessions')}>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
            }}
          >
            SESSIONS
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/setup')}>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
            }}
          >
            {usage.totalTokens > 0 ? `${usage.totalTokens} tok` : 'SETUP'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.md }}
      />

      <View
        style={{
          borderTopColor: theme.colors.steel,
          borderTopWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
        }}
      >
        <TextInput
          aria-label="Message"
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask the agent…"
          placeholderTextColor={theme.colors.inkMuted}
          onSubmitEditing={onSend}
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.sm,
            borderWidth: 1,
            color: theme.colors.ink,
            flex: 1,
            fontFamily: theme.typography.body.fontFamily,
            fontSize: theme.typography.body.fontSize,
            padding: theme.spacing.sm,
          }}
        />
        <Pressable
          accessibilityLabel={isStreaming ? 'Stop the run' : 'Send message'}
          onPress={isStreaming ? () => void stop() : onSend}
          style={{
            alignItems: 'center',
            backgroundColor: isStreaming ? theme.colors.steel : theme.colors.gold,
            borderRadius: theme.radius.sm,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md,
          }}
        >
          <Text
            style={{
              color: theme.colors.canvas,
              fontFamily: theme.typography.mono.fontFamily,
              fontWeight: '700',
            }}
          >
            {isStreaming ? '■' : '↑'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

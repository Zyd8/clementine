import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { ProfilePicker } from '@/components/features/ProfilePicker';
import { ThinkingDots } from '@/components/features/ThinkingDots';
import { ToolCallCard } from '@/components/features/ToolCallCard';
import { Avatar } from '@/components/ui/Avatar';
import { Bubble } from '@/components/ui/Bubble';
import { MicButton } from '@/components/ui/MicButton';
import { useChat } from '@/hooks/useChat';
import { useKeyboardOverlap } from '@/hooks/useKeyboardOverlap';
import { useTheme } from '@/hooks/useTheme';
import { useChatStore, type FeedItem } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';
import { useUsageStore } from '@/stores/usage';
import { formatTokens } from '@/utils/formatTokens';

/**
 * The chat surface: a terminal scrollback where user turns, agent turns and
 * tool lines interleave. Thin by design — `useChat` owns the turn lifecycle.
 */
export default function ChatScreen() {
  const theme = useTheme();
  const connection = useConnectionStore((s) => s.connection);

  const profiles = useProfilesStore((s) => s.profiles);
  const activeId = useProfilesStore((s) => s.activeId);
  const selectProfile = useProfilesStore((s) => s.select);
  const profileId = useProfilesStore((s) => s.activeProfileId)();
  const activeProfile = profiles.find((p) => p.id === activeId);
  const avatar = activeProfile?.avatar ?? 'DF';

  const feed = useChatStore((s) => s.feed(profileId));
  const activeRun = useChatStore((s) => s.activeRun(profileId));
  const usage = useUsageStore((s) => s.total(profileId));

  const { send, stop, isStreaming } = useChat(profileId);
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // KeyboardAvoidingView did nothing on Android — see useKeyboardOverlap.
  const composerRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(composerRef);

  // Follows the reply as it streams in, and lands at the bottom on open —
  // e.g. after `useChat` resumes the last session's history, so re-entering
  // the tab shows the end of the conversation, not the top of it.
  //
  // Driven by `onContentSizeChange`, not a `feed`-keyed effect: an effect
  // fires the instant the state updates, before FlatList has actually
  // measured the newly grown content, so `scrollToEnd` computed against a
  // stale height and landed short — most visible on a bubble still growing
  // sentence by sentence. `onContentSizeChange` fires after real layout, so
  // the target height is the true one.
  const feedListRef = useRef<FlatList<FeedItem>>(null);
  const hasScrolledOnce = useRef(false);
  const scrollToBottom = () => {
    // Instant on first paint (nothing to see sliding into place on open);
    // animated afterward, so a growing reply reads as following along.
    feedListRef.current?.scrollToEnd({ animated: hasScrolledOnce.current });
    hasScrolledOnce.current = true;
  };

  const onSend = () => {
    const text = draft;
    setDraft('');
    void send(text);
  };

  // A run is live but nothing has streamed yet — on a tool-heavy turn that
  // gap runs to seconds, and an empty scrollback reads as a hang.
  const showThinking =
    activeRun !== null && !feed.some((item) => item.kind === 'assistant');

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
        {...(item.kind === 'assistant'
          ? { streaming: item.streaming, avatar }
          : {})}
      />
    );
  };

  if (!connection) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.canvas,
          flex: 1,
          gap: theme.spacing.md,
          justifyContent: 'center',
          padding: 32,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.full,
            borderWidth: 1,
            height: 56,
            justifyContent: 'center',
            width: 56,
          }}
        >
          <Text style={{ color: theme.colors.inkMuted, fontSize: theme.type(22) }}>◆</Text>
        </View>
        <Text
          style={{
            color: theme.colors.ink,
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type(14),
            textAlign: 'center',
          }}
        >
          no hermes instance connected
        </Text>
        <Text
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(12),
            lineHeight: 19,
            maxWidth: 260,
            textAlign: 'center',
          }}
        >
          point this app at a Hermes instance to start a chat — server URL + API
          key from that host&apos;s .env.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/setup')}
          style={{
            backgroundColor: theme.colors.gold,
            borderRadius: theme.radius.md,
            marginTop: 6,
            paddingHorizontal: 22,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.canvas,
              fontFamily: theme.fonts.bold,
              fontSize: theme.type(12),
              letterSpacing: 0.5,
            }}
          >
            + CONNECT HERMES
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.colors.canvas, flex: 1 }}>
      <View
        style={{
          alignItems: 'center',
          borderBottomColor: theme.colors.steel,
          borderBottomWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.sm,
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            flex: 1,
            flexDirection: 'row',
            gap: theme.spacing.sm,
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
              fontFamily: theme.fonts.semibold,
              fontSize: theme.type(14),
            }}
          >
            {connection.name || connection.baseUrl}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch profile"
          onPress={() => setPickerOpen(true)}
          style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}
        >
          <Avatar initials={avatar} size={34} />
          <Text
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.semibold,
              fontSize: theme.type(11.5),
            }}
          >
            {activeProfile?.name ?? 'default'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={feedListRef}
        testID="chat-feed"
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        // Must shrink, not just grow: the composer's keyboard lift is taken
        // out of this list's height. Without it the column overflows and the
        // composer is pushed further under the keyboard.
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.md }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
            <View
              testID="usage-badge"
              style={{
                alignSelf: 'center',
                backgroundColor: theme.colors.canvasRaised,
                borderColor: theme.colors.steel,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  color: theme.colors.inkMuted,
                  fontFamily: theme.fonts.regular,
                  fontSize: theme.type(11),
                }}
              >
                {`${formatTokens(usage.totalTokens)} used today`}
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          showThinking ? (
            <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 8 }}>
              <Avatar initials={avatar} size={30} />
              <ThinkingDots testID="thinking" />
            </View>
          ) : null
        }
      />

      <View
        ref={composerRef}
        style={{
          alignItems: 'center',
          borderTopColor: theme.colors.steel,
          borderTopWidth: 1,
          flexDirection: 'row',
          gap: 10,
          marginBottom: keyboardOverlap,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <TextInput
          aria-label="Message"
          value={draft}
          onChangeText={setDraft}
          placeholder={isStreaming ? 'agent is working…' : 'message the agent…'}
          placeholderTextColor={theme.colors.inkMuted}
          onSubmitEditing={onSend}
          style={{
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.sm,
            borderWidth: 1,
            color: theme.colors.ink,
            flex: 1,
            fontFamily: theme.fonts.regular,
            fontSize: theme.type(13.5),
            paddingHorizontal: 12,
            paddingVertical: 11,
          }}
        />
        <Pressable
          accessibilityLabel={isStreaming ? 'Stop the run' : 'Send message'}
          onPress={isStreaming ? () => void stop() : onSend}
          style={{
            alignItems: 'center',
            backgroundColor: isStreaming ? theme.colors.steel : theme.colors.gold,
            borderRadius: theme.radius.sm,
            height: 38,
            justifyContent: 'center',
            width: 38,
          }}
        >
          <Text
            style={{
              color: theme.colors.canvas,
              fontFamily: theme.fonts.bold,
              fontSize: theme.type(16),
            }}
          >
            {isStreaming ? '■' : '➜'}
          </Text>
        </Pressable>
        {/* Opens voice mode rather than recording here: `useVoiceChat` keeps
            its machine in component state, so two mounted callers would run
            two competing sessions. 46px per the design's composer row — the
            64px circle belongs to the voice overlay. */}
        <MicButton
          voiceState="IDLE"
          onPress={() => router.push('/voice')}
          size={46}
        />
      </View>

      <ProfilePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        endpointName={connection.name || connection.baseUrl}
        profiles={profiles}
        activeId={activeId}
        onSelectProfile={(id) => void selectProfile(id)}
      />
    </View>
  );
}

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProfilePicker } from '@/components/features/ProfilePicker';
import { ThinkingDots } from '@/components/features/ThinkingDots';
import { ToolCallCard } from '@/components/features/ToolCallCard';
import { Avatar } from '@/components/ui/Avatar';
import { Bubble } from '@/components/ui/Bubble';
import { MicButton } from '@/components/ui/MicButton';
import { useAttachments } from '@/hooks/useAttachments';
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
  const { attachments, pickImage, pickFile, remove: removeAttachment, clear: clearAttachments } =
    useAttachments();

  const onAttach = () => {
    Alert.alert('Attach', undefined, [
      { text: 'Photo', onPress: () => void pickImage() },
      { text: 'File', onPress: () => void pickFile() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
  //
  // Always instant, never animated: a streaming reply fires this many times
  // a second (once per token), and animated scrolls that frequent interrupt
  // each other before any one of them finishes — the visible position
  // perpetually lags behind the true bottom. A tool call fires this rarely
  // enough that each animated scroll had time to complete, which is why
  // tool messages reached the bottom fully and a streaming reply didn't.
  // Called this often, instant reads as smooth following anyway.
  const feedListRef = useRef<FlatList<FeedItem>>(null);

  // Whether the user is currently at (or near) the bottom of the feed. Only
  // auto-scroll when true: otherwise a streaming token (content growth), a
  // tool line, or the keyboard resize (onLayout) would keep ripping the user
  // back down to the bottom while they're trying to read earlier messages.
  // Defaults to true so opening the tab still lands at the end of the
  // conversation, as the original comment above describes.
  const stickToBottomRef = useRef(true);
  // Distance from the bottom (px) that still counts as "at the bottom".
  // Generous so a partially visible last bubble doesn't stop auto-follow.
  const BOTTOM_STICK_THRESHOLD = 100;

  const onFeedScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stickToBottomRef.current = distanceFromBottom < BOTTOM_STICK_THRESHOLD;
  };

  const scrollToBottom = () => {
    if (stickToBottomRef.current) {
      feedListRef.current?.scrollToEnd({ animated: false });
    }
  };

  const onSend = () => {
    const text = draft;
    const staged = attachments;
    setDraft('');
    // Cleared on tap, not after send resolves: `send` reports failure through
    // the feed (a run.failed item), same as a plain message does — there is
    // no separate "attachment didn't go through" state to hold these for.
    clearAttachments();
    // Explicit user action — snap to the bottom even if they'd scrolled up,
    // so the new message and its reply are visible from the moment they land.
    stickToBottomRef.current = true;
    feedListRef.current?.scrollToEnd({ animated: false });
    void send(text, staged);
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
        onScroll={onFeedScroll}
        scrollEventThrottle={16}
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

      {/* Sent as base64 embedded in the message text — there is no confirmed
          upload path (`POST /v1/runs` only documents a plain-text `input`),
          so this is an experimental fallback, not a real upload. Whether the
          connected agent's model actually reads it as an image/file rather
          than a wall of text isn't guaranteed. See attachmentEncoding.ts. */}
      {attachments.length > 0 ? (
        <View style={{ borderTopColor: theme.colors.steel, borderTopWidth: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, padding: 10 }}
          >
            {attachments.map((attachment) => (
              <View
                key={attachment.id}
                testID={`attachment-${attachment.id}`}
                style={{
                  alignItems: 'center',
                  backgroundColor: theme.colors.canvasRaised,
                  borderColor: theme.colors.steel,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  flexDirection: 'row',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.ink,
                    fontFamily: theme.fonts.regular,
                    fontSize: theme.type(11.5),
                    maxWidth: 140,
                  }}
                >
                  {attachment.kind === 'image' ? '🖼 ' : '📄 '}
                  {attachment.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.name}`}
                  onPress={() => removeAttachment(attachment.id)}
                  hitSlop={8}
                >
                  <Text style={{ color: theme.colors.inkMuted, fontSize: theme.type(13) }}>
                    ×
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.fonts.regular,
              fontSize: theme.type(9.5),
              paddingBottom: 6,
              paddingHorizontal: 10,
            }}
          >
            Experimental — not a confirmed upload; the agent may not read it.
          </Text>
        </View>
      ) : null}

      <View
        ref={composerRef}
        style={{
          alignItems: 'center',
          borderTopColor: theme.colors.steel,
          borderTopWidth: attachments.length > 0 ? 0 : 1,
          flexDirection: 'row',
          gap: 10,
          marginBottom: keyboardOverlap,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        {/* Opens voice mode rather than recording here: `useVoiceChat` keeps
            its machine in component state, so two mounted callers would run
            two competing sessions. 46px per the design's composer row — the
            64px circle belongs to the voice overlay. Leftmost, ahead of the
            text field, so it reads as an alternative way to start a turn
            rather than a trailing extra. */}
        <MicButton
          voiceState="IDLE"
          onPress={() => router.push('/voice')}
          size={46}
        />
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
          accessibilityRole="button"
          accessibilityLabel="Attach a file or photo"
          onPress={onAttach}
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.canvasRaised,
            borderColor: theme.colors.steel,
            borderRadius: theme.radius.sm,
            borderWidth: 1,
            height: 38,
            justifyContent: 'center',
            width: 38,
          }}
        >
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.fonts.bold,
              fontSize: theme.type(16),
            }}
          >
            +
          </Text>
        </Pressable>
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

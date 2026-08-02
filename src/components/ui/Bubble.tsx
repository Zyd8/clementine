import React from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/hooks/useTheme';

type BubbleProps = {
  role: 'user' | 'assistant' | 'error';
  text: string;
  streaming?: boolean;
  /** Profile initials, shown beside an agent turn. Assistant role only. */
  avatar?: string;
  testID?: string;
};

/**
 * A turn in the scrollback.
 *
 * The user speaks in a flat raised panel; the agent speaks transparently
 * behind a gold left border — the agent's words wear the focus color.
 *
 * In-flight assistant text is a `polite` live region so VoiceOver/TalkBack
 * announce it without interrupting. Throttling those announcements to
 * sentence boundaries is Phase 7's job (it needs `sentenceBuffer` from the
 * voice pipeline); today the region is declared but the text updates per
 * delta.
 */
export function Bubble({ role, text, streaming, avatar, testID }: BubbleProps) {
  const theme = useTheme();

  const accent = role === 'error' ? theme.colors.err : theme.colors.gold;
  const isUser = role === 'user';

  const body = (
    <View
      testID={testID}
      accessibilityLiveRegion={role === 'assistant' && streaming ? 'polite' : 'none'}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: isUser ? '82%' : '100%',
        flexShrink: 1,
        backgroundColor: isUser ? theme.colors.canvasRaised : 'transparent',
        borderLeftColor: isUser ? undefined : accent,
        borderLeftWidth: isUser ? 0 : 2,
        borderRadius: isUser ? theme.radius.md : 0,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        style={{
          color: role === 'error' ? theme.colors.err : theme.colors.ink,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: theme.typography.body.fontSize,
          lineHeight: theme.typography.body.lineHeight,
        }}
      >
        {/* The store keeps the wire text verbatim, and Hermes often opens a
            reply with blank lines after a tool call. Trimming the ends is a
            render concern: interior blank lines are the agent's formatting
            and stay. While streaming only the head is trimmed, so the cursor
            still sits against the last character. */}
        {streaming ? text.trimStart() : text.trim()}
        {streaming ? (
          <Text accessibilityLabel="Agent is replying" style={{ color: accent }}>
            {' █'}
          </Text>
        ) : null}
      </Text>
    </View>
  );

  // The agent's turns are attributed to the active profile; the user's are
  // not — a bubble on the right is unambiguously theirs.
  if (avatar === undefined || role !== 'assistant') return body;

  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 8, maxWidth: '88%' }}>
      <View style={{ marginTop: 9 }}>
        <Avatar initials={avatar} size={24} />
      </View>
      {body}
    </View>
  );
}

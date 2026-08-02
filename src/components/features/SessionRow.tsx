import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SessionSummary } from '@/types/sessions';
import { useTheme } from '@/hooks/useTheme';

/**
 * A row in the session list.
 *
 * Root sessions show their `title` alone. Forked sessions (parentId +
 * branchIndex) carry a "{title} · b{n}" label so lineage is visible at a
 * glance without needing a tree renderer. This convention is tested — see
 * the sibling test file for the fork-labelling spec.
 */

type SessionRowProps = {
  session: SessionSummary;
  onTap: (sessionId: string) => void;
  onFork: (sessionId: string) => void;
  isResuming?: boolean;
  testID?: string;
};

/** Returns a human-readable relative time string, e.g. "2m ago". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;

  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Build the display title: root sessions show the title, forks append branch info. */
function displayTitle(session: SessionSummary): string {
  if (session.parentId !== undefined && session.branchIndex !== undefined) {
    return `${session.title} · b${session.branchIndex}`;
  }
  return session.title;
}

export function SessionRow({
  session,
  onTap,
  onFork,
  isResuming,
  testID,
}: SessionRowProps) {
  const theme = useTheme();
  const isFork = session.parentId !== undefined;
  const title = displayTitle(session);
  const time = relativeTime(session.lastMessageAt);

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={`${title} — ${session.messageCount} messages, tap to resume`}
      onPress={() => onTap(session.id)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.canvasRaised : theme.colors.canvas,
        borderLeftColor: isResuming ? theme.colors.gold : isFork ? theme.colors.inkMuted : 'transparent',
        borderLeftWidth: isResuming || isFork ? 2 : 0,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      })}
    >
      {/* Content area */}
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.ink,
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize,
              fontWeight: '600',
              flex: 1,
            }}
          >
            {title}
          </Text>
          <Text
            testID="session-timestamp"
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
            }}
          >
            {time}
          </Text>
        </View>

        {/* Preview */}
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.inkMuted,
            fontFamily: theme.typography.body.fontFamily,
            fontSize: theme.typography.body.fontSize,
            lineHeight: theme.typography.body.lineHeight,
          }}
        >
          {session.preview}
        </Text>

        {/* Metadata row: message count + fork button */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
            }}
          >
            {session.messageCount} msgs
          </Text>
          <Pressable
            accessibilityLabel={`Fork ${title}`}
            onPress={() => onFork(session.id)}
            hitSlop={8}
            style={{
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.typography.mono.fontSize,
              }}
            >
              FORK
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

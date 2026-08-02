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
  const base = session.title || session.preview || 'Untitled session';
  if (session.parentId !== undefined && session.branchIndex !== undefined) {
    return `${base} · b${session.branchIndex}`;
  }
  return base;
}

/** A short id fragment for the row, e.g. "run_0a868c…" → "0a868c". */
function shortId(id: string): string {
  // ids look like run_<24 hex> or api_<timestamp>_<8 hex>. Keep the tail.
  const tail = id.split('_').pop() ?? id;
  return tail.length > 8 ? tail.slice(0, 8) : tail;
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
  // The preview line is redundant when the title fell back to it.
  const showPreview = !!session.preview && session.preview !== title;

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
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      })}
    >
      {/* Content area */}
      <View style={{ flex: 1, gap: 2 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.ink,
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.type(14),
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
              fontSize: theme.type(10),
            }}
          >
            {time}
          </Text>
        </View>

        {/* Preview — one line, muted, small. Hidden when the title already
            IS the preview (title-less sessions fall back to it), so the
            message isn't shown twice. */}
        {showPreview ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: theme.type(11),
              lineHeight: theme.type(15),
            }}
          >
            {session.preview}
          </Text>
        ) : null}

        {/* Metadata row: short id + message count, fork rightmost */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Text
              testID="session-id"
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.type(9),
                opacity: 0.7,
              }}
            >
              #{shortId(session.id)}
            </Text>
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.type(10),
              }}
            >
              {session.messageCount} msgs
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Fork ${title}`}
            onPress={() => onFork(session.id)}
            hitSlop={8}
            style={{
              borderColor: theme.colors.steel,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                color: theme.colors.inkMuted,
                fontFamily: theme.typography.mono.fontFamily,
                fontSize: theme.type(10),
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

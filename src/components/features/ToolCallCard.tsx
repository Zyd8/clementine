import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type ToolCallCardProps = {
  tool: string;
  args: string;
  status: 'running' | 'ok' | 'error';
  durationMs?: number;
  testID?: string;
};

const STATE_LABEL: Record<ToolCallCardProps['status'], string> = {
  running: 'running',
  ok: 'completed',
  error: 'failed',
};

/**
 * One line of the agent's terminal transcript.
 *
 * Steel while running (idle language), ok/err once resolved. The state is
 * carried in `accessibilityLabel` as well as color — a screen reader user
 * needs to hear "terminal: echo hi — completed", not just see a border
 * change hue.
 */
export function ToolCallCard({
  tool,
  args,
  status,
  durationMs,
  testID,
}: ToolCallCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const accent =
    status === 'ok'
      ? theme.colors.ok
      : status === 'error'
        ? theme.colors.err
        : theme.colors.steel;

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={`${tool}: ${args} — ${STATE_LABEL[status]}`}
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((value) => !value)}
      style={{
        backgroundColor: theme.colors.canvasRaised,
        borderLeftColor: accent,
        borderLeftWidth: 2,
        borderRadius: theme.radius.sm,
        gap: theme.spacing.xs,
        padding: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text
          style={{
            color: accent,
            fontFamily: theme.typography.mono.fontFamily,
            fontSize: theme.typography.mono.fontSize,
            fontWeight: '600',
          }}
        >
          {tool.toUpperCase()}
        </Text>
        {durationMs === undefined ? null : (
          <Text
            style={{
              color: theme.colors.inkMuted,
              fontFamily: theme.typography.mono.fontFamily,
              fontSize: theme.typography.mono.fontSize,
            }}
          >
            {durationMs} ms
          </Text>
        )}
      </View>

      <Text
        // Collapsed to a single line so a 200-character command doesn't push
        // the rest of the transcript off screen.
        {...(expanded ? {} : { numberOfLines: 1 })}
        style={{
          color: theme.colors.inkMuted,
          fontFamily: theme.typography.mono.fontFamily,
          fontSize: theme.typography.mono.fontSize,
        }}
      >
        {args}
      </Text>
    </Pressable>
  );
}

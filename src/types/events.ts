import { z } from 'zod';

/**
 * The boundary between Hermes's wire format and the app's event model.
 *
 * These shapes were captured from a live Hermes API server, and differ from
 * the table in ARCHITECTURE.md in ways that matter:
 *
 * | wire                     | app                  | note                        |
 * |--------------------------|----------------------|-----------------------------|
 * | `message.delta.delta`    | `assistant.delta`    | different name AND field    |
 * | `tool.started.preview`   | `args`               | not `args` on the wire      |
 * | `tool.completed.error`   | `ok`                 | **inverted boolean**        |
 * | `duration` (seconds)     | `durationMs`         | unit change                 |
 * | `usage.input_tokens`     | `usage.inputTokens`  | snake_case → camelCase      |
 * | `reasoning.available`    | (dropped)            | duplicates streamed deltas  |
 *
 * Anything unrecognised normalizes to `null` rather than throwing — a future
 * Hermes adding an event must never crash a shipped client.
 */

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type StreamEvent =
  | { type: 'assistant.delta'; text: string }
  | { type: 'tool.started'; tool: string; args: string }
  | { type: 'tool.completed'; tool: string; ok: boolean; durationMs?: number }
  | { type: 'run.completed'; output: string; usage?: TokenUsage }
  | { type: 'run.failed'; message: string };

const usageSchema = z
  .object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  })
  .transform((u) => ({
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    totalTokens: u.total_tokens,
  }));

const deltaSchema = z.object({ delta: z.string().min(1) });

const toolStartedSchema = z.object({
  tool: z.string(),
  preview: z.string().optional(),
});

const toolCompletedSchema = z.object({
  tool: z.string(),
  // Wire sends `error: false` for success — inverted from our `ok`.
  error: z.boolean().optional(),
  duration: z.number().optional(),
});

const runCompletedSchema = z.object({
  output: z.string(),
  usage: usageSchema.optional(),
});

const runFailedSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

/** Wire payload → `StreamEvent`, or `null` if it carries nothing to render. */
export function normalizeEvent(payload: unknown): StreamEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const name = record.event;
  if (typeof name !== 'string') return null;

  switch (name) {
    case 'message.delta': {
      const parsed = deltaSchema.safeParse(record);
      return parsed.success
        ? { type: 'assistant.delta', text: parsed.data.delta }
        : null;
    }

    case 'tool.started': {
      const parsed = toolStartedSchema.safeParse(record);
      return parsed.success
        ? {
            type: 'tool.started',
            tool: parsed.data.tool,
            args: parsed.data.preview ?? '',
          }
        : null;
    }

    case 'tool.completed': {
      const parsed = toolCompletedSchema.safeParse(record);
      if (!parsed.success) return null;
      return {
        type: 'tool.completed',
        tool: parsed.data.tool,
        ok: parsed.data.error !== true,
        ...(parsed.data.duration === undefined
          ? {}
          : { durationMs: Math.round(parsed.data.duration * 1000) }),
      };
    }

    case 'run.completed': {
      const parsed = runCompletedSchema.safeParse(record);
      if (!parsed.success) return null;
      return {
        type: 'run.completed',
        output: parsed.data.output,
        ...(parsed.data.usage ? { usage: parsed.data.usage } : {}),
      };
    }

    case 'run.failed': {
      const parsed = runFailedSchema.safeParse(record);
      if (!parsed.success) return null;
      return {
        type: 'run.failed',
        message: parsed.data.error ?? parsed.data.message ?? 'The run failed.',
      };
    }

    // `reasoning.available` repeats the already-streamed text verbatim;
    // rendering it would duplicate every reply. Unknown events are ignored.
    default:
      return null;
  }
}

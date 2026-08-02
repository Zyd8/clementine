import { create } from 'zustand';

import type { StreamEvent, TokenUsage } from '@/types/events';
import { profileKey, type ProfileId } from '@/utils/profile';

export { profileKey, type ProfileId };

/**
 * In-flight run state and the rendered feed.
 *
 * Everything is keyed by `profileId | null`. No shipping Hermes exposes
 * profiles yet, so the key is always `null` today — but building the
 * composite key now costs nothing and avoids a state migration when Phase 3
 * eventually lands.
 *
 * The feed is a flat, ordered list, not a message array with nested tool
 * calls: the chat surface is a terminal scrollback where user turns, agent
 * turns and tool lines interleave like a REPL transcript.
 */

export type FeedItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      tool: string;
      args: string;
      status: 'running' | 'ok' | 'error';
      durationMs?: number;
    }
  | { kind: 'error'; id: string; text: string };

const ZERO_USAGE: TokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

type ProfileState = {
  feed: FeedItem[];
  usage: TokenUsage;
  activeRun: string | null;
};

/**
 * One shared instance, not a fresh object per call. Selectors run on every
 * getSnapshot, so handing back a new fallback for an untouched profile makes
 * React see a changed snapshot every render and warn "The result of
 * getSnapshot should be cached to avoid an infinite loop".
 *
 * Safe to share because every writer below rebuilds state with spreads —
 * nothing mutates a ProfileState or its feed in place. Frozen so that stays
 * true.
 */
const EMPTY_PROFILE: ProfileState = Object.freeze({
  feed: Object.freeze([] as FeedItem[]) as FeedItem[],
  usage: ZERO_USAGE,
  activeRun: null,
});

const emptyProfile = (): ProfileState => EMPTY_PROFILE;

let counter = 0;
const nextId = () => `item_${(counter += 1)}`;

type ChatState = {
  byProfile: Record<string, ProfileState>;
  feed: (profileId: ProfileId) => FeedItem[];
  usage: (profileId: ProfileId) => TokenUsage;
  activeRun: (profileId: ProfileId) => string | null;
  appendUserMessage: (profileId: ProfileId, text: string) => void;
  applyEvent: (profileId: ProfileId, event: StreamEvent) => void;
  setActiveRun: (profileId: ProfileId, runId: string | null) => void;
  reconcileCompletion: (
    profileId: ProfileId,
    output: string,
    usage?: TokenUsage,
  ) => void;
  reset: (profileId: ProfileId) => void;
};

/** Closes any open streaming bubble. */
const settle = (feed: FeedItem[]): FeedItem[] =>
  feed.map((item) =>
    item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item,
  );

function reduce(state: ProfileState, event: StreamEvent): ProfileState {
  switch (event.type) {
    case 'assistant.delta': {
      const last = state.feed[state.feed.length - 1];
      // Deltas accumulate into the open bubble; a new one opens only if the
      // last item isn't an assistant bubble still streaming.
      if (last?.kind === 'assistant' && last.streaming) {
        return {
          ...state,
          feed: [
            ...state.feed.slice(0, -1),
            { ...last, text: last.text + event.text },
          ],
        };
      }
      return {
        ...state,
        feed: [
          ...state.feed,
          { kind: 'assistant', id: nextId(), text: event.text, streaming: true },
        ],
      };
    }

    case 'tool.started':
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: 'tool',
            id: nextId(),
            tool: event.tool,
            args: event.args,
            status: 'running',
          },
        ],
      };

    case 'tool.completed': {
      // The wire carries no call id, so match the oldest still-running call
      // of that tool — FIFO is the only ordering the stream guarantees.
      const index = state.feed.findIndex(
        (item) =>
          item.kind === 'tool' && item.tool === event.tool && item.status === 'running',
      );
      if (index === -1) return state;

      const target = state.feed[index] as Extract<FeedItem, { kind: 'tool' }>;
      const updated: FeedItem = {
        ...target,
        status: event.ok ? 'ok' : 'error',
        ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
      };
      return {
        ...state,
        feed: [...state.feed.slice(0, index), updated, ...state.feed.slice(index + 1)],
      };
    }

    case 'run.completed': {
      const streamed = state.feed.some(
        (item) => item.kind === 'assistant' && item.streaming,
      );
      // `output` repeats what the deltas already rendered — only fall back to
      // it when no deltas arrived at all, or the text would double.
      const feed = streamed
        ? settle(state.feed)
        : [
            ...state.feed,
            { kind: 'assistant' as const, id: nextId(), text: event.output, streaming: false },
          ];

      const usage = event.usage
        ? {
            inputTokens: state.usage.inputTokens + event.usage.inputTokens,
            outputTokens: state.usage.outputTokens + event.usage.outputTokens,
            totalTokens: state.usage.totalTokens + event.usage.totalTokens,
          }
        : state.usage;

      return { ...state, feed, usage, activeRun: null };
    }

    case 'run.failed':
      return {
        ...state,
        feed: [
          ...settle(state.feed),
          { kind: 'error', id: nextId(), text: event.message },
        ],
        activeRun: null,
      };
  }
}

export const useChatStore = create<ChatState>((set, get) => {
  const profile = (profileId: ProfileId): ProfileState =>
    get().byProfile[profileKey(profileId)] ?? emptyProfile();

  const update = (profileId: ProfileId, next: (state: ProfileState) => ProfileState) =>
    set((state) => ({
      byProfile: {
        ...state.byProfile,
        [profileKey(profileId)]: next(
          state.byProfile[profileKey(profileId)] ?? emptyProfile(),
        ),
      },
    }));

  return {
    byProfile: {},

    feed: (profileId) => profile(profileId).feed,
    usage: (profileId) => profile(profileId).usage,
    activeRun: (profileId) => profile(profileId).activeRun,

    appendUserMessage: (profileId, text) =>
      update(profileId, (state) => ({
        ...state,
        feed: [...state.feed, { kind: 'user', id: nextId(), text }],
      })),

    applyEvent: (profileId, event) => update(profileId, (state) => reduce(state, event)),

    setActiveRun: (profileId, runId) =>
      update(profileId, (state) => ({ ...state, activeRun: runId })),

    /**
     * Repairs the feed after a stream drop, using the server's authoritative
     * output. The partially streamed bubble is *discarded*, not appended to:
     * Hermes offers no event replay, so the partial text and the final output
     * overlap in an unknowable way, and concatenating them would duplicate
     * whatever the user already read.
     */
    reconcileCompletion: (profileId, output, usage) =>
      update(profileId, (state) =>
        reduce(
          {
            ...state,
            feed: state.feed.filter(
              (item) => !(item.kind === 'assistant' && item.streaming),
            ),
          },
          { type: 'run.completed', output, ...(usage ? { usage } : {}) },
        ),
      ),

    reset: (profileId) => update(profileId, emptyProfile),
  };
});

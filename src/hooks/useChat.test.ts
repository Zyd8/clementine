import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';

import { createRun, getRun, streamRunEvents } from '@/api/runs';
import { getSessionMessages, listSessions } from '@/api/sessions';
import { ApiError } from '@/api/client';
import { useChatStore } from '@/stores/chat';
import { useUsageStore } from '@/stores/usage';
import { useConnectionStore } from '@/stores/connection';
import type { StreamEvent } from '@/types/events';
import { encodeAttachmentForPrompt } from '@/utils/attachmentEncoding';

import { useChat } from './useChat';

// Real by default (the actual encode + size-cap logic is what the
// "attachments" describe block below exercises); overridden per-test with
// `mockRejectedValueOnce` where a specific non-size failure is needed.
jest.mock('@/utils/attachmentEncoding', () => ({
  ...jest.requireActual('@/utils/attachmentEncoding'),
  encodeAttachmentForPrompt: jest.fn(jest.requireActual('@/utils/attachmentEncoding').encodeAttachmentForPrompt),
}));
const mockedEncode = encodeAttachmentForPrompt as jest.MockedFunction<
  typeof encodeAttachmentForPrompt
>;

jest.mock('@/api/runs', () => ({
  ...jest.requireActual('@/api/runs'),
  createRun: jest.fn(),
  getRun: jest.fn(),
  stopRun: jest.fn(),
  streamRunEvents: jest.fn(),
}));

jest.mock('@/api/sessions', () => ({
  listSessions: jest.fn(),
  getSessionMessages: jest.fn(),
}));

const mockedCreateRun = createRun as jest.MockedFunction<typeof createRun>;
const mockedGetRun = getRun as jest.MockedFunction<typeof getRun>;
const mockedStream = streamRunEvents as jest.MockedFunction<typeof streamRunEvents>;
const mockedListSessions = listSessions as jest.MockedFunction<typeof listSessions>;
const mockedGetSessionMessages = getSessionMessages as jest.MockedFunction<
  typeof getSessionMessages
>;

/** Turns a fixed list of events into the async iterable the hook consumes. */
const streamOf = (events: StreamEvent[]) =>
  (async function* () {
    for (const event of events) yield event;
  })();

const streamThatThrows = (events: StreamEvent[], error: Error) =>
  (async function* () {
    for (const event of events) yield event;
    throw error;
  })();

const CONNECTION = {
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c...1b',
  connectedAt: 1,
};

const feed = () => useChatStore.getState().feed(null);

describe('useChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatStore.getState().reset(null);
    useUsageStore.getState().reset(null);
    useConnectionStore.setState({ connection: CONNECTION, hydrated: true });
    mockedCreateRun.mockResolvedValue({ runId: 'run_abc', status: 'started' });
    mockedStream.mockReturnValue(streamOf([]));
    // No prior session by default — matches every existing test's
    // expectations (a fresh createRun call, nothing to resume).
    mockedListSessions.mockResolvedValue({ sessions: [] });
    mockedGetSessionMessages.mockResolvedValue({ messages: [] });
  });

  it('renders the user message optimistically, before the run is created', async () => {
    let feedWhenCalled: unknown;
    mockedCreateRun.mockImplementation(async () => {
      feedWhenCalled = feed();
      return { runId: 'run_abc', status: 'started' as const };
    });

    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hello');
    });

    expect(feedWhenCalled).toMatchObject([{ kind: 'user', text: 'hello' }]);
  });

  it('creates a run with the typed input', async () => {
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hello');
    });
    expect(mockedCreateRun).toHaveBeenCalledWith(
      CONNECTION.baseUrl,
      CONNECTION.apiKey,
      expect.objectContaining({ input: 'hello' }),
    );
  });

  it('streams deltas into the feed', async () => {
    mockedStream.mockReturnValue(
      streamOf([
        { type: 'assistant.delta', text: 'He' },
        { type: 'assistant.delta', text: 'llo' },
        { type: 'run.completed', output: 'Hello' },
      ]),
    );
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() =>
      expect(feed()).toMatchObject([
        { kind: 'user' },
        { kind: 'assistant', text: 'Hello', streaming: false },
      ]),
    );
  });

  it('renders tool calls as they stream', async () => {
    mockedStream.mockReturnValue(
      streamOf([
        { type: 'tool.started', tool: 'terminal', args: 'echo hi' },
        { type: 'tool.completed', tool: 'terminal', ok: true, durationMs: 102 },
        { type: 'run.completed', output: 'done' },
      ]),
    );
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('run it');
    });
    await waitFor(() =>
      expect(feed()).toContainEqual(
        expect.objectContaining({ kind: 'tool', tool: 'terminal', status: 'ok' }),
      ),
    );
  });

  it('tracks the active run while in flight, and clears it after', async () => {
    let activeDuringRun: string | null = null;
    mockedStream.mockReturnValue(
      (async function* () {
        activeDuringRun = useChatStore.getState().activeRun(null);
        yield { type: 'run.completed', output: 'x' } as StreamEvent;
      })(),
    );

    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });

    expect(activeDuringRun).toBe('run_abc');
    expect(useChatStore.getState().activeRun(null)).toBeNull();
  });

  it('reports isStreaming false once the turn has settled', async () => {
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('refuses to send an empty message', async () => {
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('   ');
    });
    expect(mockedCreateRun).not.toHaveBeenCalled();
    expect(feed()).toEqual([]);
  });

  it('refuses a second send while a run is in flight — no interleaved runs', async () => {
    let secondSend: Promise<void> | undefined;
    const { result } = await renderHook(() => useChat());

    mockedStream.mockReturnValue(
      (async function* () {
        secondSend = result.current.send('second');
        yield { type: 'run.completed', output: 'x' } as StreamEvent;
      })(),
    );

    await act(async () => {
      await result.current.send('first');
      await secondSend;
    });

    expect(mockedCreateRun).toHaveBeenCalledTimes(1);
    expect(feed().filter((item) => item.kind === 'user')).toHaveLength(1);
  });

  it('surfaces a 401 as an actionable error item', async () => {
    mockedCreateRun.mockRejectedValue(new ApiError('auth', 401));
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() =>
      expect(feed()).toContainEqual(
        expect.objectContaining({ kind: 'error', text: expect.stringMatching(/key/i) }),
      ),
    );
  });

  it('keeps the user message in the feed when the run fails to start', async () => {
    mockedCreateRun.mockRejectedValue(new ApiError('network'));
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    await waitFor(() => expect(feed()[0]).toMatchObject({ kind: 'user', text: 'hi' }));
  });

  it('clears the in-flight flag after a failure so the user can retry', async () => {
    mockedCreateRun.mockRejectedValueOnce(new ApiError('network'));
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    expect(result.current.isStreaming).toBe(false);

    await act(async () => {
      await result.current.send('again');
    });
    expect(mockedCreateRun).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there is no configured connection', async () => {
    useConnectionStore.setState({ connection: null, hydrated: true });
    const { result } = await renderHook(() => useChat());
    await act(async () => {
      await result.current.send('hi');
    });
    expect(mockedCreateRun).not.toHaveBeenCalled();
  });

  describe('reconnect after a dropped stream', () => {
    it('polls the run after the stream drops', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([{ type: 'assistant.delta', text: 'par' }], new ApiError('network')),
      );
      mockedGetRun.mockResolvedValue({
        runId: 'run_abc',
        status: 'completed',
        output: 'partial then rest',
      });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });
      await waitFor(() => expect(mockedGetRun).toHaveBeenCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        'run_abc',
      ));
    });

    it('reconciles to the authoritative output without duplicating streamed text', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([{ type: 'assistant.delta', text: 'par' }], new ApiError('network')),
      );
      mockedGetRun.mockResolvedValue({
        runId: 'run_abc',
        status: 'completed',
        output: 'partial then rest',
      });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() => {
        const bubbles = feed().filter((item) => item.kind === 'assistant');
        expect(bubbles).toHaveLength(1);
        expect(bubbles[0]).toMatchObject({
          text: 'partial then rest',
          streaming: false,
        });
      });
    });

    it('shows an error when the run is still running and cannot be resumed', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([], new ApiError('network')),
      );
      mockedGetRun.mockResolvedValue({ runId: 'run_abc', status: 'running' });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });
      await waitFor(() =>
        expect(feed()).toContainEqual(expect.objectContaining({ kind: 'error' })),
      );
    });

    it('surfaces an error when the reconnect poll itself fails', async () => {
      mockedStream.mockReturnValue(streamThatThrows([], new ApiError('network')));
      mockedGetRun.mockRejectedValue(new ApiError('network'));

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });
      await waitFor(() =>
        expect(feed()).toContainEqual(expect.objectContaining({ kind: 'error' })),
      );
    });

    it('renders a failed run reported by the poll', async () => {
      mockedStream.mockReturnValue(streamThatThrows([], new ApiError('network')));
      mockedGetRun.mockResolvedValue({ runId: 'run_abc', status: 'failed' });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });
      await waitFor(() =>
        expect(feed()).toContainEqual(expect.objectContaining({ kind: 'error' })),
      );
    });
  });

  // ---- Phase 6: usage store wiring ----

  describe('usage persistence', () => {
    it('pushes usage into the usage store on every completed run', async () => {
      const usage = { inputTokens: 10, outputTokens: 2, totalTokens: 12 };
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Hello' },
          { type: 'run.completed', output: 'Hello', usage },
        ]),
      );

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() =>
        expect(useUsageStore.getState().total(null)).toMatchObject({ totalTokens: 12 }),
      );
    });

    it('does not push usage when run.completed carries no usage payload', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Hi' },
          { type: 'run.completed', output: 'Hi' },
        ]),
      );

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() =>
        expect(useUsageStore.getState().total(null)).toEqual({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        }),
      );
    });

    it('pushes usage during reconcile after a dropped stream', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([{ type: 'assistant.delta', text: 'par' }], new ApiError('network')),
      );
      mockedGetRun.mockResolvedValue({
        runId: 'run_abc',
        status: 'completed',
        output: 'partial then rest',
        usage: { inputTokens: 8, outputTokens: 1, totalTokens: 9 },
      });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() =>
        expect(useUsageStore.getState().total(null)).toMatchObject({ totalTokens: 9 }),
      );
    });

    it('accumulates usage across multiple turns', async () => {
      // First turn
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'run.completed', output: 'a', usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } },
        ]),
      );
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('first');
      });
      await waitFor(() =>
        expect(useUsageStore.getState().total(null).totalTokens).toBe(6),
      );

      // Second turn
      mockedCreateRun.mockResolvedValue({ runId: 'run_def', status: 'started' });
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'run.completed', output: 'b', usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } },
        ]),
      );
      await act(async () => {
        await result.current.send('second');
      });
      await waitFor(() =>
        expect(useUsageStore.getState().total(null).totalTokens).toBe(10),
      );
    });
  });

  // ---- Phase 6: Sentry SSE-error tagging ----

  describe('Sentry SSE-error tagging', () => {
    it('reports a stream error to Sentry tagged by reason', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([], new ApiError('network')),
      );
      mockedGetRun.mockResolvedValue({ runId: 'run_abc', status: 'completed', output: 'x' });

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'network' }),
          expect.objectContaining({ tags: { reason: 'network' } }),
        );
      });
    });

    it('reports an auth error to Sentry tagged as auth', async () => {
      mockedCreateRun.mockRejectedValue(new ApiError('auth', 401));

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'auth' }),
          expect.objectContaining({ tags: { reason: 'auth' } }),
        );
      });
    });

    it('reports a non-ApiError as untagged generic failure', async () => {
      mockedStream.mockReturnValue(
        streamThatThrows([], new Error('something unexpected')),
      );
      mockedGetRun.mockRejectedValue(new Error('also unexpected'));

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      await waitFor(() => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ tags: { reason: 'stream' } }),
        );
      });
    });
  });

  describe('session continuity', () => {
    /**
     * `createRun` with no session id creates a brand-new session — the bug
     * this exists for: reopening the app used to start a fresh conversation
     * every time, because nothing ever remembered where the last one left
     * off.
     */
    it('resumes the most recent session on mount, before anything is sent', async () => {
      mockedListSessions.mockResolvedValue({
        sessions: [
          {
            id: 'sess_last',
            title: 'x',
            preview: '',
            lastMessageAt: '2026-01-01T00:00:00Z',
            messageCount: 2,
          },
        ],
      });
      mockedGetSessionMessages.mockResolvedValue({
        messages: [
          { role: 'user', content: 'earlier question' },
          { role: 'assistant', content: 'earlier answer' },
        ],
      });

      await renderHook(() => useChat());

      await waitFor(() => {
        expect(feed()).toEqual([
          expect.objectContaining({ kind: 'user', text: 'earlier question' }),
          expect.objectContaining({ kind: 'assistant', text: 'earlier answer' }),
        ]);
      });
    });

    it('continues the resumed session, not a new one, on the next send', async () => {
      mockedListSessions.mockResolvedValue({
        sessions: [
          {
            id: 'sess_last',
            title: 'x',
            preview: '',
            lastMessageAt: '2026-01-01T00:00:00Z',
            messageCount: 1,
          },
        ],
      });
      mockedGetSessionMessages.mockResolvedValue({
        messages: [{ role: 'user', content: 'earlier question' }],
      });

      const { result } = await renderHook(() => useChat());
      await waitFor(() => expect(feed().length).toBeGreaterThan(0));

      mockedListSessions.mockClear();
      await act(async () => {
        await result.current.send('follow-up');
      });

      expect(mockedCreateRun).toHaveBeenCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        expect.objectContaining({ sessionId: 'sess_last' }),
      );
    });

    /** A populated feed means something is already loaded — must not stomp it. */
    it('does not resume over a feed that already has content', async () => {
      useChatStore.getState().appendUserMessage(null, 'already here');
      mockedListSessions.mockResolvedValue({
        sessions: [
          {
            id: 'sess_other',
            title: 'x',
            preview: '',
            lastMessageAt: '2026-01-01T00:00:00Z',
            messageCount: 1,
          },
        ],
      });

      await renderHook(() => useChat());

      await waitFor(() => {
        expect(mockedListSessions).not.toHaveBeenCalled();
      });
      expect(feed()).toEqual([expect.objectContaining({ text: 'already here' })]);
    });

    /** Nothing to resume — a genuinely new profile's first-ever message. */
    it('sends without a session id when there is nothing to resume', async () => {
      const { result } = await renderHook(() => useChat());
      await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.send('hi');
      });

      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.sessionId).toBeUndefined();
    });

    /**
     * The regression this guards: without this, every message from a
     * brand-new profile spins up its own session, not just the first one —
     * there was nothing resumed on mount to continue, so nothing was known
     * until this lookup runs.
     */
    it('learns the session after the first message, so the second one continues it', async () => {
      const { result } = await renderHook(() => useChat());
      await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(1));

      mockedListSessions.mockResolvedValue({
        sessions: [
          {
            id: 'sess_new',
            title: 'x',
            preview: '',
            lastMessageAt: '2026-01-01T00:00:00Z',
            messageCount: 1,
          },
        ],
      });

      await act(async () => {
        await result.current.send('first message');
      });
      await waitFor(() => expect(mockedListSessions).toHaveBeenCalledTimes(2));

      await act(async () => {
        await result.current.send('second message');
      });

      expect(mockedCreateRun).toHaveBeenLastCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        expect.objectContaining({ sessionId: 'sess_new' }),
      );
    });

    /** A resume that fails must not break sending — same as no session found. */
    it('starts fresh, without crashing, when the resume lookup fails', async () => {
      mockedListSessions.mockRejectedValue(new Error('network'));

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('hi');
      });

      expect(mockedCreateRun).toHaveBeenCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        expect.not.objectContaining({ sessionId: expect.anything() }),
      );
    });
  });

  describe('attachments', () => {
    const IMAGE = {
      id: 'a1',
      uri: 'file:///photo.jpg',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      kind: 'image' as const,
      size: 4,
    };

    /**
     * There is no confirmed upload path — the encoded payload goes into
     * `input` itself (see attachmentEncoding.ts) — but nobody wants to read
     * a wall of base64 in the message they just sent.
     */
    it('keeps the base64 payload out of the user’s own bubble', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('check this out', [IMAGE]);
      });

      expect(feed()).toEqual([
        expect.objectContaining({ kind: 'user', text: 'check this out\n📎 photo.jpg' }),
      ]);
      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.input).not.toContain('check this out\n📎 photo.jpg');
    });

    it('sends the encoded attachment in the wire input', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('check this out', [IMAGE]);
      });

      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.input).toContain('check this out');
      expect(options.input).toContain('data:image/jpeg;base64,');
    });

    it('tells the agent how to read an attachment, on top of the phone instructions', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('check this out', [IMAGE]);
      });

      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.instructions).toContain('phone app');
      expect(options.instructions).toContain('data URI');
    });

    /** No attachments — the wire format must not change from before this existed. */
    it('does not layer attachment instructions onto a plain message', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('just text');
      });

      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.instructions).toBeUndefined();
    });

    it('sends with only an attachment and no typed text', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('', [IMAGE]);
      });

      expect(mockedCreateRun).toHaveBeenCalled();
      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.input).toContain('data:image/jpeg;base64,');
    });

    /**
     * The regression this guards: an unbounded attachment embedded straight
     * into a text field risks silently blowing past a request or context
     * limit. Caught before any network call, with a message naming which
     * attachment and why — never a run left dangling.
     */
    it('fails clearly, without starting a run, when an attachment is too large', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('check this out', [{ ...IMAGE, size: 10_000_000 }]);
      });

      expect(mockedCreateRun).not.toHaveBeenCalled();
      expect(feed()).toEqual([
        expect.objectContaining({ kind: 'user' }),
        expect.objectContaining({ kind: 'error', text: expect.stringContaining('photo.jpg') }),
      ]);
    });

    /**
     * A generic "Could not attach that file" hid what actually went wrong —
     * on a real device this can fail for several distinct reasons that look
     * identical from the outside (a cloud-only photo not yet downloaded
     * locally, a content URI the file reader can't open, a permissions gap),
     * and a vague message gave no way to tell which one happened.
     */
    it('includes the real error when encoding fails for a reason other than size', async () => {
      mockedEncode.mockRejectedValueOnce(new Error('could not read file at path'));

      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('check this out', [IMAGE]);
      });

      expect(mockedCreateRun).not.toHaveBeenCalled();
      expect(feed()).toEqual([
        expect.objectContaining({ kind: 'user' }),
        expect.objectContaining({
          kind: 'error',
          text: expect.stringContaining('could not read file at path'),
        }),
      ]);
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ tags: { reason: 'attachment' } }),
      );
    });

    it('clears the in-flight guard after an oversized attachment, so the next send works', async () => {
      const { result } = await renderHook(() => useChat());
      await act(async () => {
        await result.current.send('a', [{ ...IMAGE, size: 10_000_000 }]);
      });

      await act(async () => {
        await result.current.send('b');
      });

      expect(mockedCreateRun).toHaveBeenCalledTimes(1);
      expect(mockedCreateRun).toHaveBeenCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        expect.objectContaining({ input: 'b' }),
      );
    });
  });
});

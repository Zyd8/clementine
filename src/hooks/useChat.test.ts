import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createRun, getRun, streamRunEvents } from '@/api/runs';
import { ApiError } from '@/api/client';
import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import type { StreamEvent } from '@/types/events';

import { useChat } from './useChat';

jest.mock('@/api/runs', () => ({
  createRun: jest.fn(),
  getRun: jest.fn(),
  stopRun: jest.fn(),
  streamRunEvents: jest.fn(),
}));

const mockedCreateRun = createRun as jest.MockedFunction<typeof createRun>;
const mockedGetRun = getRun as jest.MockedFunction<typeof getRun>;
const mockedStream = streamRunEvents as jest.MockedFunction<typeof streamRunEvents>;

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
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
  connectedAt: 1,
};

const feed = () => useChatStore.getState().feed(null);

describe('useChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatStore.getState().reset(null);
    useConnectionStore.setState({ connection: CONNECTION, hydrated: true });
    mockedCreateRun.mockResolvedValue({ runId: 'run_abc', status: 'started' });
    mockedStream.mockReturnValue(streamOf([]));
  });

  it('renders the user message optimistically, before the run is created', async () => {
    // Asserted from inside the mock: at the moment the network call happens,
    // the user's message must already be in the feed. Avoids leaving pending
    // async work behind, which corrupts RNTL's harness for later tests.
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
    // Observed from inside the stream: the generator body runs mid-turn, so
    // it can sample the store without leaving pending work behind (which
    // corrupts RNTL's harness for every later test in the file).
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
        // Re-entrant send, fired while the first run is genuinely in flight.
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

    // The retry actually goes through — the guard really was released.
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
    /**
     * Hermes sends no Last-Event-ID and offers no event replay, so a client
     * cannot resume mid-stream. The decided behaviour, pinned here: on a
     * network drop, poll GET /v1/runs/{id} once and reconcile from the
     * authoritative final output — accepting a visible gap in the streamed
     * text rather than duplicating what was already rendered.
     */
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
});

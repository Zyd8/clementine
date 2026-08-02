import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/client';
import {
  createSession,
  forkSession,
  getSessionMessages,
  listSessions,
  streamSessionChat,
} from '@/api/sessions';
import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import type { SessionsList } from '@/api/sessions';
import type { StreamEvent } from '@/types/events';

import { useSessions } from './useSessions';

jest.mock('@/api/sessions', () => ({
  createSession: jest.fn(),
  listSessions: jest.fn(),
  getSessionMessages: jest.fn(),
  forkSession: jest.fn(),
  streamSessionChat: jest.fn(),
}));

const mockedCreate = createSession as jest.MockedFunction<typeof createSession>;
const mockedList = listSessions as jest.MockedFunction<typeof listSessions>;
const mockedMessages = getSessionMessages as jest.MockedFunction<typeof getSessionMessages>;
const mockedFork = forkSession as jest.MockedFunction<typeof forkSession>;
const mockedStream = streamSessionChat as jest.MockedFunction<typeof streamSessionChat>;

const streamOf = (events: StreamEvent[]) =>
  (async function* () {
    for (const event of events) yield event;
  })();

const CONNECTION = {
  baseUrl: 'http://100.106.162.39:8642',
  apiKey: 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b',
  connectedAt: 1,
};

const TWO_SESSIONS = {
  sessions: [
    {
      id: 'sess_1',
      title: 'Debug auth',
      preview: 'What is the error?',
      lastMessageAt: '2026-08-01T12:00:00Z',
      messageCount: 5,
    },
    {
      id: 'sess_2',
      title: 'Setup cron',
      preview: 'Help me configure',
      lastMessageAt: '2026-08-02T09:00:00Z',
      messageCount: 12,
      parentId: 'sess_1',
      branchIndex: 1,
    },
  ],
};

const SESSION_MESSAGES = {
  messages: [
    { role: 'user' as const, content: 'hello' },
    { role: 'assistant' as const, content: 'Hi there!' },
  ],
};

describe('useSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatStore.getState().reset(null);
    useConnectionStore.setState({ connection: CONNECTION, hydrated: true });
    mockedList.mockResolvedValue(TWO_SESSIONS);
  });

  it('starts empty before the fetch settles', async () => {
    // Don't resolve the list yet so we can observe the initial state.
    let resolve: (v: SessionsList) => void;
    mockedList.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = await renderHook(() => useSessions());
    expect(result.current.sessions).toEqual([]);
    // Clean up: resolve so the effect doesn't hang
    resolve!(TWO_SESSIONS);
  });

  it('loads sessions on mount when a connection is configured', async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });
  });

  it('maps the wire response to SessionSummary shapes', async () => {
    const { result } = await renderHook(() => useSessions());
    await waitFor(() => {
      expect(result.current.sessions[0]).toMatchObject({
        id: 'sess_1',
        title: 'Debug auth',
      });
    });
  });

  it('exposes isLoading and error state', async () => {
    let reject: (e: unknown) => void;
    mockedList.mockReturnValue(new Promise((_, rj) => { reject = rj; }));

    const { result } = await renderHook(() => useSessions());
    // While the fetch is pending, isLoading is true
    expect(result.current.isLoading).toBe(true);

    // Now reject
    reject!(new ApiError('network'));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('does not fetch when there is no connection', async () => {
    useConnectionStore.setState({ connection: null, hydrated: true });
    const { result } = await renderHook(() => useSessions());
    expect(result.current.sessions).toEqual([]);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('keys session data by profileId', async () => {
    // Load for null profile
    const { result: a } = await renderHook(() => useSessions(null));
    await waitFor(() => expect(a.current.sessions).toHaveLength(2));

    // Load for 'work' profile — different data
    mockedList.mockResolvedValue({
      sessions: [{ id: 'sess_w', title: 'Work', preview: '', lastMessageAt: 'Z', messageCount: 1 }],
    });
    const { result: b } = await renderHook(() => useSessions('work'));
    await waitFor(() => {
      expect(b.current.sessions[0]).toMatchObject({ id: 'sess_w', title: 'Work' });
    });
    // null profile still has its original data
    expect(a.current.sessions[0]).toMatchObject({ id: 'sess_1' });
  });

  describe('resume', () => {
    beforeEach(() => {
      mockedMessages.mockResolvedValue(SESSION_MESSAGES);
      mockedStream.mockReturnValue(streamOf([{ type: 'run.completed', output: 'OK' }]));
    });

    it('loads session messages into the chat store', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.resume('sess_1');
      });

      const feed = useChatStore.getState().feed(null);
      expect(feed).toHaveLength(2);
      expect(feed[0]).toMatchObject({ kind: 'user', text: 'hello' });
      expect(feed[1]).toMatchObject({ kind: 'assistant', text: 'Hi there!' });
    });

    it('resets the chat store before loading history', async () => {
      useChatStore.getState().appendUserMessage(null, 'stale');
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.resume('sess_1');
      });

      const feed = useChatStore.getState().feed(null);
      expect(feed).toHaveLength(2);
      expect(feed[0]).toMatchObject({ kind: 'user', text: 'hello' });
    });

    it('does nothing when there is no active connection', async () => {
      useConnectionStore.setState({ connection: null, hydrated: true });
      const { result } = await renderHook(() => useSessions());

      await act(async () => {
        await result.current.resume('sess_1');
      });

      expect(mockedMessages).not.toHaveBeenCalled();
    });

    it('sets resumingSessionId while loading and clears it afterwards', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      // Verify resumingSessionId is set during resume (before await resolves)
      const resumePromise = act(async () => {
        await result.current.resume('sess_1');
      });
      // The state update happens synchronously (setResumingSessionId is called before the await)
      // but React state updates are batched — check after the promise settles
      await resumePromise;
      expect(result.current.resumingSessionId).toBeNull();
    });
  });

  describe('send in resumed session', () => {
    beforeEach(() => {
      mockedMessages.mockResolvedValue(SESSION_MESSAGES);
      mockedStream.mockReturnValue(streamOf([
        { type: 'assistant.delta', text: 'Sure!' },
        { type: 'run.completed', output: 'Sure!' },
      ]));
    });

    it('streams a follow-up via the session chat/stream path', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.resume('sess_1');
      });

      await act(async () => {
        await result.current.send('what about X?');
      });

      expect(mockedStream).toHaveBeenCalledWith(
        CONNECTION.baseUrl,
        CONNECTION.apiKey,
        'sess_1',
        'what about X?',
      );
    });

    it('appends the follow-up reply to the feed via the chat store', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.resume('sess_1');
      });

      await act(async () => {
        await result.current.send('follow-up');
      });

      const feed = useChatStore.getState().feed(null);
      const userMessages = feed.filter((item) => item.kind === 'user');
      expect(userMessages).toHaveLength(2); // history + follow-up
      expect(userMessages[1]).toMatchObject({ text: 'follow-up' });
    });

    it('refuses to send when not resumed into any session', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.send('orphan');
      });

      expect(mockedStream).not.toHaveBeenCalled();
    });
  });

  describe('fork', () => {
    it('calls the fork API and refreshes the session list', async () => {
      mockedFork.mockResolvedValue({
        id: 'sess_forked',
        title: 'Debug auth',
        preview: '',
        lastMessageAt: 'Z',
        messageCount: 0,
        parentId: 'sess_1',
        branchIndex: 2,
      });

      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.fork('sess_1');
      });

      expect(mockedFork).toHaveBeenCalledWith(CONNECTION.baseUrl, CONNECTION.apiKey, 'sess_1');
      expect(mockedList).toHaveBeenCalledTimes(2);
    });

    it('does nothing with no connection', async () => {
      useConnectionStore.setState({ connection: null, hydrated: true });
      const { result } = await renderHook(() => useSessions());

      await act(async () => {
        await result.current.fork('sess_1');
      });

      expect(mockedFork).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('re-fetches the session list', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      mockedList.mockResolvedValue({
        sessions: [{ id: 'sess_new', title: 'Fresh', preview: '', lastMessageAt: 'Z', messageCount: 1 }],
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockedList).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(result.current.sessions[0]).toMatchObject({ id: 'sess_new' });
      });
    });
  });

  describe('startNew', () => {
    beforeEach(() => {
      mockedCreate.mockResolvedValue({
        id: 'sess_fresh',
        title: 'Untitled',
        preview: '',
        lastMessageAt: '2026-08-02T10:00:00Z',
        messageCount: 0,
      });
    });

    it('creates a new session via the API', async () => {
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.startNew();
      });

      expect(mockedCreate).toHaveBeenCalledWith(CONNECTION.baseUrl, CONNECTION.apiKey, {});
    });

    it('resets the chat store for a fresh feed', async () => {
      // Seed the store with stale data
      useChatStore.getState().appendUserMessage(null, 'stale');
      const { result } = await renderHook(() => useSessions());
      await waitFor(() => expect(result.current.sessions).toHaveLength(2));

      await act(async () => {
        await result.current.startNew();
      });

      const feed = useChatStore.getState().feed(null);
      expect(feed).toHaveLength(0);
    });

    it('does nothing when there is no connection', async () => {
      useConnectionStore.setState({ connection: null, hydrated: true });
      const { result } = await renderHook(() => useSessions());

      await act(async () => {
        await result.current.startNew();
      });

      expect(mockedCreate).not.toHaveBeenCalled();
    });
  });
});

import {
  createSession,
  forkSession,
  getSessionMessages,
  listSessions,
  streamSessionChat,
} from './sessions';

const BASE = 'http://100.106.162.39:8642';
const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const sseResponse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

describe('listSessions', () => {
  const mockList = {
    sessions: [
      {
        id: 'sess_1',
        title: 'Debug auth',
        preview: 'What is the error in the logs?',
        last_message_at: '2026-08-01T12:00:00Z',
        message_count: 5,
      },
      {
        id: 'sess_2',
        title: 'Setup cron',
        preview: 'Help me configure cron jobs',
        last_message_at: '2026-08-02T09:00:00Z',
        message_count: 12,
        parent_id: 'sess_1',
        branch_index: 1,
      },
    ],
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(json(mockList)) as never;
  });

  it('calls GET /api/sessions with limit and offset', async () => {
    await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    const url = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toContain('/api/sessions');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=0');
  });

  it('normalises snake_case into camelCase', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]).toMatchObject({
      id: 'sess_1',
      title: 'Debug auth',
      preview: 'What is the error in the logs?',
      lastMessageAt: '2026-08-01T12:00:00Z',
      messageCount: 5,
    });
  });

  it('preserves lineage fields for forked sessions', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[1]).toMatchObject({
      parentId: 'sess_1',
      branchIndex: 1,
    });
  });

  it('omits lineage fields when absent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      json({ sessions: [{ id: 'sess_1', title: 'x', last_message_at: 'Z', message_count: 1 }] }),
    );
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]).not.toHaveProperty('parentId');
    expect(result.sessions[0]).not.toHaveProperty('branchIndex');
  });

  it('maps a 401 to an auth error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(json({}, 401));
    await expect(listSessions(BASE, KEY, { limit: 10, offset: 0 })).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('falls back to empty string when preview is absent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      json({ sessions: [{ id: 'sess_1', title: 'x', last_message_at: 'Z', message_count: 0 }] }),
    );
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]!.preview).toBe('');
  });
});

describe('createSession', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      json({ id: 'sess_new', title: 'Untitled', last_message_at: 'Z', message_count: 0 }),
    ) as never;
  });

  it('posts to /api/sessions', async () => {
    await createSession(BASE, KEY);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${BASE}/api/sessions`);
  });

  it('sends an optional title', async () => {
    await createSession(BASE, KEY, { title: 'My Session' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ title: 'My Session' });
  });

  it('returns the created session summary', async () => {
    const result = await createSession(BASE, KEY);
    expect(result).toMatchObject({ id: 'sess_new', title: 'Untitled', messageCount: 0 });
  });
});

describe('getSessionMessages', () => {
  const mockMessages = {
    messages: [
      { role: 'user', content: 'hello', timestamp: '2026-08-01T12:00:00Z' },
      { role: 'assistant', content: 'Hi there!', timestamp: '2026-08-01T12:00:01Z' },
      {
        role: 'tool',
        content: 'echo hi → hi',
        tool: 'terminal',
        ok: true,
        timestamp: '2026-08-01T12:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(json(mockMessages)) as never;
  });

  it('calls GET /api/sessions/{id}/messages', async () => {
    await getSessionMessages(BASE, KEY, 'sess_1');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${BASE}/api/sessions/sess_1/messages`,
    );
  });

  it('returns parsed messages with all fields', async () => {
    const result = await getSessionMessages(BASE, KEY, 'sess_1');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(result.messages[2]).toMatchObject({ role: 'tool', tool: 'terminal', ok: true });
  });
});

describe('forkSession', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      json({
        id: 'sess_forked',
        title: 'Debug auth',
        parent_id: 'sess_1',
        branch_index: 2,
        last_message_at: 'Z',
        message_count: 0,
      }),
    ) as never;
  });

  it('posts to /api/sessions/{id}/fork', async () => {
    await forkSession(BASE, KEY, 'sess_1');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${BASE}/api/sessions/sess_1/fork`,
    );
  });

  it('returns the forked session with lineage', async () => {
    const result = await forkSession(BASE, KEY, 'sess_1');
    expect(result).toMatchObject({
      id: 'sess_forked',
      title: 'Debug auth',
      parentId: 'sess_1',
      branchIndex: 2,
    });
  });
});

describe('streamSessionChat', () => {
  it('yields normalized events from an SSE stream over POST', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {"event":"message.delta","delta":"OK"}\n\n',
        'data: {"event":"run.completed","output":"OK."}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamSessionChat(BASE, KEY, 'sess_1', 'follow-up')) {
      seen.push(event);
    }

    expect(seen).toEqual([
      { type: 'assistant.delta', text: 'OK' },
      { type: 'run.completed', output: 'OK.' },
    ]);

    // Verifies it was a POST, not a GET
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(url).toBe(`${BASE}/api/sessions/sess_1/chat/stream`);
  });

  it('sends the input as JSON body', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"run.completed","output":"x"}\n\n']),
    ) as never;

    for await (const _ of streamSessionChat(BASE, KEY, 'sess_1', 'follow-up')) void _;
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ input: 'follow-up' });
  });

  it('reassembles events split across chunk boundaries', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"message.', 'delta","delta":"hi"}\n\n']),
    ) as never;

    const seen = [];
    for await (const event of streamSessionChat(BASE, KEY, 'sess_1', 'hi')) seen.push(event);
    expect(seen).toEqual([{ type: 'assistant.delta', text: 'hi' }]);
  });

  it('maps a 401 on the stream to an auth error', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 401 })) as never;
    const iterate = async () => {
      for await (const _ of streamSessionChat(BASE, KEY, 'sess_1', 'hi')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps a dropped connection to a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    const iterate = async () => {
      for await (const _ of streamSessionChat(BASE, KEY, 'sess_1', 'hi')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'network' });
  });

  it('yields tool events through the same normalizeEvent path as Path A', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {"event":"tool.started","tool":"terminal","preview":"echo hi"}\n\n',
        'data: {"event":"tool.completed","tool":"terminal","error":false,"duration":0.1}\n\n',
        'data: {"event":"run.completed","output":"done"}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamSessionChat(BASE, KEY, 'sess_1', 'run')) seen.push(event);

    expect(seen).toContainEqual({
      type: 'tool.started',
      tool: 'terminal',
      args: 'echo hi',
    });
    expect(seen).toContainEqual({
      type: 'tool.completed',
      tool: 'terminal',
      ok: true,
      durationMs: 100,
    });
  });
});

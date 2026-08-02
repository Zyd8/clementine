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

// WireSession shape from the real Hermes API
const WIRE_SESSION_1 = {
  id: 'sess_1',
  source: 'chat',
  user_id: 'user_1',
  model: 'deepseek-v4-pro',
  title: 'Debug auth',
  started_at: '2026-08-01T12:00:00Z',
  ended_at: '',
  end_reason: '',
  message_count: 5,
  tool_call_count: 3,
  input_tokens: 500,
  output_tokens: 1200,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 0,
  estimated_cost_usd: 0.002,
  actual_cost_usd: 0.002,
  api_call_count: 1,
  parent_session_id: '',
  has_system_prompt: false,
  has_model_config: false,
};

const WIRE_SESSION_2 = {
  id: 'sess_2',
  source: 'chat',
  user_id: 'user_1',
  model: 'deepseek-v4-pro',
  title: 'Setup cron',
  started_at: '2026-08-02T09:00:00Z',
  ended_at: '',
  end_reason: '',
  message_count: 12,
  tool_call_count: 7,
  input_tokens: 800,
  output_tokens: 2500,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  reasoning_tokens: 100,
  estimated_cost_usd: 0.005,
  actual_cost_usd: 0.005,
  api_call_count: 2,
  parent_session_id: 'sess_1',
  has_system_prompt: true,
  has_model_config: false,
};

describe('listSessions', () => {
  const mockList = {
    object: 'list',
    data: [WIRE_SESSION_1, WIRE_SESSION_2],
    limit: 50,
    offset: 0,
    has_more: false,
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

  it('reads sessions from body.data (real Hermes shape)', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions).toHaveLength(2);
  });

  it('normalises snake_case wire fields into camelCase', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]).toMatchObject({
      id: 'sess_1',
      title: 'Debug auth',
      messageCount: 5,
    });
  });

  it('maps started_at to lastMessageAt', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]!.lastMessageAt).toBe('2026-08-01T12:00:00Z');
  });

  it('maps parent_session_id to parentId when non-empty', async () => {
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[1]).toMatchObject({
      parentId: 'sess_1',
    });
  });

  it('omits parentId when parent_session_id is empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      json({ object: 'list', data: [WIRE_SESSION_1], limit: 50, offset: 0, has_more: false }),
    );
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]).not.toHaveProperty('parentId');
  });

  it('falls back to empty string when preview-generating fields are absent', async () => {
    // Real Hermes has no preview field; preview always defaults to ''
    const result = await listSessions(BASE, KEY, { limit: 10, offset: 0 });
    expect(result.sessions[0]!.preview).toBe('');
  });

  it('maps a 401 to an auth error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(json({}, 401));
    await expect(listSessions(BASE, KEY, { limit: 10, offset: 0 })).rejects.toMatchObject({
      kind: 'auth',
    });
  });
});

describe('createSession', () => {
  const WIRE_SESSION_NEW = {
    id: 'sess_new',
    source: 'chat',
    user_id: 'user_1',
    model: 'deepseek-v4-pro',
    title: 'Untitled',
    started_at: '2026-08-02T10:00:00Z',
    ended_at: '',
    end_reason: '',
    message_count: 0,
    tool_call_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    estimated_cost_usd: 0,
    actual_cost_usd: 0,
    api_call_count: 0,
    parent_session_id: '',
    has_system_prompt: false,
    has_model_config: false,
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      json({ object: 'hermes.session', session: WIRE_SESSION_NEW }),
    ) as never;
  });

  it('posts to /api/sessions', async () => {
    await createSession(BASE, KEY);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${BASE}/api/sessions`);
  });

  it('always sends a JSON body (even {} when no title)', async () => {
    await createSession(BASE, KEY);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toBe('{}');
    expect(init.method).toBe('POST');
  });

  it('sends a title when provided', async () => {
    await createSession(BASE, KEY, { title: 'My Session' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ title: 'My Session' });
  });

  it('reads the created session from body.session (real envelope)', async () => {
    const result = await createSession(BASE, KEY);
    expect(result).toMatchObject({ id: 'sess_new', title: 'Untitled', messageCount: 0 });
  });

  it('returns the created session summary', async () => {
    const result = await createSession(BASE, KEY, { title: 'Titled' });
    expect(result).toMatchObject({ id: 'sess_new', title: 'Untitled', messageCount: 0 });
  });

  it('rejects with auth error on 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(json({}, 401));
    await expect(createSession(BASE, KEY)).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('getSessionMessages', () => {
  const mockMessages = {
    object: 'list',
    session_id: 'sess_1',
    data: [
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

  it('reads messages from body.data (real Hermes shape)', async () => {
    const result = await getSessionMessages(BASE, KEY, 'sess_1');
    expect(result.messages).toHaveLength(3);
  });

  it('returns parsed messages with all fields', async () => {
    const result = await getSessionMessages(BASE, KEY, 'sess_1');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(result.messages[2]).toMatchObject({ role: 'tool', tool: 'terminal', ok: true });
  });
});

describe('forkSession', () => {
  const WIRE_FORKED = {
    id: 'sess_forked',
    source: 'chat',
    user_id: 'user_1',
    model: 'deepseek-v4-pro',
    title: 'Debug auth',
    started_at: '2026-08-02T11:00:00Z',
    ended_at: '',
    end_reason: '',
    message_count: 0,
    tool_call_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    estimated_cost_usd: 0,
    actual_cost_usd: 0,
    api_call_count: 0,
    parent_session_id: 'sess_1',
    has_system_prompt: true,
    has_model_config: false,
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      json({ object: 'hermes.session', session: WIRE_FORKED }),
    ) as never;
  });

  it('posts to /api/sessions/{id}/fork', async () => {
    await forkSession(BASE, KEY, 'sess_1');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${BASE}/api/sessions/sess_1/fork`,
    );
  });

  it('always sends a JSON body ({} required, 400 without)', async () => {
    await forkSession(BASE, KEY, 'sess_1');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.body).toBe('{}');
    expect(init.method).toBe('POST');
  });

  it('reads the forked session from body.session (real envelope)', async () => {
    const result = await forkSession(BASE, KEY, 'sess_1');
    expect(result).toMatchObject({
      id: 'sess_forked',
      title: 'Debug auth',
      parentId: 'sess_1',
    });
  });

  it('returns the forked session with lineage', async () => {
    const result = await forkSession(BASE, KEY, 'sess_1');
    expect(result).toMatchObject({
      id: 'sess_forked',
      title: 'Debug auth',
      parentId: 'sess_1',
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

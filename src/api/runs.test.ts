import * as Sentry from '@sentry/react-native';

import { createRun, getRun, resolveApproval, stopRun, streamRunEvents } from './runs';

const BASE = 'http://100.106.162.39:8642';
const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** A Response whose body streams the given chunks, like a real SSE response. */
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

describe('createRun', () => {
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(json({ run_id: 'run_abc', status: 'started' })) as never;
  });

  it('posts to /v1/runs', async () => {
    await createRun(BASE, KEY, { input: 'hi' });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${BASE}/v1/runs`);
  });

  it('sends the input', async () => {
    await createRun(BASE, KEY, { input: 'hi' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ input: 'hi' });
  });

  it('includes session_id when resuming an existing session', async () => {
    await createRun(BASE, KEY, { input: 'hi', sessionId: 'sess_1' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ session_id: 'sess_1' });
  });

  it('omits session_id entirely for a fresh run', async () => {
    await createRun(BASE, KEY, { input: 'hi' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('session_id');
  });

  it('returns the run id (202 Accepted is the real success status)', async () => {
    await expect(createRun(BASE, KEY, { input: 'hi' })).resolves.toMatchObject({
      runId: 'run_abc',
    });
  });

  it('propagates an auth failure as a distinguishable error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(json({}, 401));
    await expect(createRun(BASE, KEY, { input: 'hi' })).rejects.toMatchObject({
      kind: 'auth',
    });
  });
});

describe('getRun', () => {
  it('reads status, output and usage for reconnect reconciliation', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      json({
        object: 'hermes.run',
        run_id: 'run_abc',
        status: 'completed',
        output: 'OK.',
        usage: { input_tokens: 16218, output_tokens: 30, total_tokens: 16248 },
      }),
    ) as never;

    await expect(getRun(BASE, KEY, 'run_abc')).resolves.toMatchObject({
      runId: 'run_abc',
      status: 'completed',
      output: 'OK.',
      usage: { inputTokens: 16218, outputTokens: 30, totalTokens: 16248 },
    });
  });

  it('handles a still-running run with no output yet', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(json({ run_id: 'run_abc', status: 'running' })) as never;
    await expect(getRun(BASE, KEY, 'run_abc')).resolves.toMatchObject({
      status: 'running',
    });
  });
});

describe('stopRun', () => {
  it('posts to the stop endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ ok: true })) as never;
    await stopRun(BASE, KEY, 'run_abc');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${BASE}/v1/runs/run_abc/stop`,
    );
  });
});

describe('resolveApproval', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(json({ ok: true })) as never;
  });

  it('posts the decision to the approval endpoint', async () => {
    await resolveApproval(BASE, KEY, 'run_abc', true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `${BASE}/v1/runs/run_abc/approval`,
    );
  });

  it('sends an approval', async () => {
    await resolveApproval(BASE, KEY, 'run_abc', true);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ approved: true });
  });

  it('sends a denial', async () => {
    await resolveApproval(BASE, KEY, 'run_abc', false);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ approved: false });
  });
});

describe('streamRunEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('yields normalized events from a real-shaped stream', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {"event":"message.delta","delta":"OK"}\n\n',
        'data: {"event":"run.completed","output":"OK."}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);

    expect(seen).toEqual([
      { type: 'assistant.delta', text: 'OK' },
      { type: 'run.completed', output: 'OK.' },
    ]);
  });

  it('reassembles events split across chunk boundaries', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"message.', 'delta","delta":"hi"}\n\n']),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);
    expect(seen).toEqual([{ type: 'assistant.delta', text: 'hi' }]);
  });

  it('skips unparseable JSON without killing the stream', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {broken\n\n',
        'data: {"event":"message.delta","delta":"still here"}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);
    expect(seen).toEqual([{ type: 'assistant.delta', text: 'still here' }]);
  });

  // Phase 6: Sentry SSE-error tagging — parse errors in frames
  it('tags a malformed SSE frame as a parse error in Sentry', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {broken\n\n',
        'data: {"event":"run.completed","output":"x"}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { reason: 'parse' } }),
    );
  });

  it('does not tag well-formed frames as parse errors', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {"event":"run.completed","output":"x"}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);

    // captureException should not have been called for parse errors
    const parseCalls = (Sentry.captureException as jest.Mock).mock.calls.filter(
      (call: unknown[]) => {
        const hint = call[1] as Record<string, unknown> | undefined;
        return hint?.tags && (hint.tags as Record<string, string>).reason === 'parse';
      },
    );
    expect(parseCalls).toHaveLength(0);
  });

  it('ignores the trailing ": stream closed" comment', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"run.completed","output":"x"}\n\n', ': stream closed\n\n']),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);
    expect(seen).toHaveLength(1);
  });

  it('maps a 401 on the stream to an auth error', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 401 })) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps a dropped connection to a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps a 500 on the stream to a server error', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 500 })) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'server' });
  });

  it('maps a 404 on the stream to not-hermes', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('', { status: 404 })) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'not-hermes' });
  });

  it('rejects a 200 response that carries no body at all', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, body: null }) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'not-hermes' });
  });

  it('maps an aborted stream to a timeout rather than a network drop', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as never;
    const iterate = async () => {
      for await (const _ of streamRunEvents(BASE, KEY, 'run_abc')) void _;
    };
    await expect(iterate()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('emits a final frame that arrived without its terminator', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"run.completed","output":"truncated"}']),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);
    expect(seen).toEqual([{ type: 'run.completed', output: 'truncated' }]);
  });

  it('ignores a truncated final frame that is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse(['data: {"event":"run.comp']),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) seen.push(event);
    expect(seen).toEqual([]);
  });

  it('stops early when the consumer breaks out of the loop', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      sseResponse([
        'data: {"event":"message.delta","delta":"a"}\n\n',
        'data: {"event":"message.delta","delta":"b"}\n\n',
      ]),
    ) as never;

    const seen = [];
    for await (const event of streamRunEvents(BASE, KEY, 'run_abc')) {
      seen.push(event);
      break;
    }
    expect(seen).toHaveLength(1);
  });
});

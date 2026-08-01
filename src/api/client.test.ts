import { ApiError, makeClient } from './client';

const BASE = 'http://100.106.162.39:8642';
const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('makeClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('injects the bearer credential on every request', async () => {
    await makeClient(BASE, KEY).get('/v1/capabilities');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('joins the path onto the base URL', async () => {
    await makeClient(BASE, KEY).get('/v1/capabilities');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/capabilities`);
  });

  it('does not double up slashes when the base URL has a trailing one', async () => {
    await makeClient(`${BASE}/`, KEY).get('/v1/capabilities');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/capabilities`);
  });

  it('returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ platform: 'hermes-agent' }));
    await expect(makeClient(BASE, KEY).get('/v1/capabilities')).resolves.toEqual({
      platform: 'hermes-agent',
    });
  });

  it('sends a JSON body on post', async () => {
    await makeClient(BASE, KEY).post('/v1/runs', { input: 'hi' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ input: 'hi' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  describe('error mapping — the setup screen has to tell these apart', () => {
    it('maps 401 to an auth error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'auth',
      });
    });

    it('maps 403 to an auth error too', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 403));
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'auth',
      });
    });

    it('maps 404 to a not-hermes error — reachable host, wrong software', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 404));
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'not-hermes',
      });
    });

    it('maps 500 to a server error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'server',
      });
    });

    it('maps a fetch rejection to a network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Network request failed'));
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'network',
      });
    });

    it('maps a timeout to its own kind, not a generic network failure', async () => {
      fetchMock.mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'timeout',
      });
    });

    it('maps an unparseable body to a not-hermes error', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>hello</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );
      await expect(makeClient(BASE, KEY).get('/v1/capabilities')).rejects.toMatchObject({
        kind: 'not-hermes',
      });
    });

    it('throws ApiError instances with a human-readable message', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 401));
      const error = await makeClient(BASE, KEY)
        .get('/v1/capabilities')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toMatch(/key/i);
    });

    it('never puts the credential in the error it throws', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 401));
      const error = await makeClient(BASE, KEY)
        .get('/v1/capabilities')
        .catch((e: unknown) => e);
      expect(JSON.stringify({ ...(error as ApiError) })).not.toContain(KEY);
      expect((error as ApiError).message).not.toContain(KEY);
    });
  });

  it('aborts a request that exceeds the timeout', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      }),
    );
    await expect(
      makeClient(BASE, KEY, { timeoutMs: 10 }).get('/v1/capabilities'),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

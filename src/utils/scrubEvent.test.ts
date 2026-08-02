import { scrubEvent } from './scrubEvent';

const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';
const URL = 'http://100.106.162.39:8642';

describe('scrubEvent', () => {
  it('redacts apiKey wherever it appears in extra context', () => {
    const scrubbed = scrubEvent({ extra: { apiKey: KEY } });
    expect(JSON.stringify(scrubbed)).not.toContain(KEY);
  });

  it('redacts baseUrl wherever it appears in extra context', () => {
    const scrubbed = scrubEvent({ extra: { baseUrl: URL } });
    expect(JSON.stringify(scrubbed)).not.toContain(URL);
  });

  it('replaces redacted values with a marker rather than deleting the key', () => {
    const scrubbed = scrubEvent({ extra: { apiKey: KEY } }) as {
      extra: { apiKey: string };
    };
    expect(scrubbed.extra.apiKey).toBe('[redacted]');
  });

  it('redacts nested deep inside breadcrumb data', () => {
    const scrubbed = scrubEvent({
      breadcrumbs: [
        { category: 'http', data: { baseUrl: URL, apiKey: KEY, status: 401 } },
      ],
    });
    const json = JSON.stringify(scrubbed);
    expect(json).not.toContain(KEY);
    expect(json).not.toContain(URL);
    expect(json).toContain('401');
  });

  it('matches sensitive keys case-insensitively and across naming styles', () => {
    const scrubbed = scrubEvent({
      extra: { API_KEY: KEY, api_key: KEY, Authorization: `Bearer ${KEY}`, base_url: URL },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(KEY);
    expect(JSON.stringify(scrubbed)).not.toContain(URL);
  });

  it('redacts the credential from a profile-scoped token field', () => {
    const scrubbed = scrubEvent({ extra: { credential: KEY, token: KEY } });
    expect(JSON.stringify(scrubbed)).not.toContain(KEY);
  });

  it('strips a bearer token out of a free-text message', () => {
    const scrubbed = scrubEvent({
      message: `request failed with Authorization: Bearer ${KEY}`,
    }) as { message: string };
    expect(scrubbed.message).not.toContain(KEY);
  });

  it('strips the request URL, which carries the instance address', () => {
    const scrubbed = scrubEvent({ request: { url: `${URL}/v1/capabilities` } });
    expect(JSON.stringify(scrubbed)).not.toContain('100.106.162.39');
  });

  it('leaves non-sensitive metadata intact — telemetry still has to be useful', () => {
    const scrubbed = scrubEvent({
      extra: { runId: 'run_123', reason: 'auth', durationMs: 45 },
    }) as { extra: Record<string, unknown> };
    expect(scrubbed.extra).toEqual({ runId: 'run_123', reason: 'auth', durationMs: 45 });
  });

  it('does not mutate the event it was handed', () => {
    const event = { extra: { apiKey: KEY } };
    scrubEvent(event);
    expect(event.extra.apiKey).toBe(KEY);
  });

  it('survives null and undefined values without throwing', () => {
    expect(() => scrubEvent({ extra: { a: null, b: undefined } })).not.toThrow();
  });

  it('survives a circular structure rather than hanging the reporter', () => {
    const circular: Record<string, unknown> = { apiKey: KEY };
    circular.self = circular;
    expect(() => scrubEvent({ extra: circular })).not.toThrow();
  });

  it('returns an event (never null) so real crashes are still reported', () => {
    expect(scrubEvent({ message: 'boom' })).not.toBeNull();
  });

  // ---- Phase 6: real-shape Sentry re-verification ----

  describe('real Sentry event shapes', () => {
    it('redacts apiKey in the request url field (route params leak vector)', () => {
      const event = {
        event_id: 'abc123',
        platform: 'javascript',
        request: {
          url: `${URL}/v1/runs?apiKey=${KEY}`,
          headers: { 'User-Agent': 'test' },
        },
      };
      const scrubbed = scrubEvent(event);
      const json = JSON.stringify(scrubbed);
      expect(json).not.toContain(KEY);
      expect(json).not.toContain('100.106.162.39');
    });

    it('redacts baseUrl inside exception values and stack traces', () => {
      const event = {
        exception: {
          values: [
            {
              type: 'Error',
              value: `Failed to fetch ${URL}/v1/runs`,
              stacktrace: {
                frames: [
                  { filename: 'runs.ts', function: 'streamRunEvents' },
                ],
              },
            },
          ],
        },
      };
      const scrubbed = scrubEvent(event);
      const json = JSON.stringify(scrubbed);
      expect(json).not.toContain(URL);
    });

    it('redacts apiKey in a breadcrumb navigation event (React Navigation)', () => {
      // React Navigation breadcrumbs can carry route params in `data.to`.
      const breadcrumb = {
        type: 'navigation',
        category: 'navigation',
        data: {
          from: '/chat',
          to: `/setup?apiKey=${KEY}&baseUrl=${URL}`,
        },
        timestamp: 1234567890,
      };
      const scrubbed = scrubEvent(breadcrumb);
      const json = JSON.stringify(scrubbed);
      expect(json).not.toContain(KEY);
      expect(json).not.toContain(URL);
      // Non-sensitive navigation data should survive.
      expect(json).toContain('/chat');
    });

    it('redacts baseUrl inside breadcrumb data.http.url', () => {
      const breadcrumb = {
        category: 'http',
        data: {
          url: `${URL}/v1/runs`,
          method: 'POST',
          status_code: 202,
        },
      };
      const scrubbed = scrubEvent(breadcrumb);
      const json = JSON.stringify(scrubbed);
      expect(json).not.toContain(URL);
      expect(json).toContain('POST');
      expect(json).toContain('202');
    });

    it('redacts sensitive data inside component props that React captures', () => {
      // Sentry can capture React component props in error contexts.
      const event = {
        contexts: {
          react: {
            componentStack: '...',
            props: {
              connection: {
                baseUrl: URL,
                apiKey: KEY,
                name: 'home-hermes',
              },
            },
          },
        },
      };
      const scrubbed = scrubEvent(event);
      const json = JSON.stringify(scrubbed);
      expect(json).not.toContain(KEY);
      expect(json).not.toContain(URL);
      // Non-sensitive nested values survive.
      expect(json).toContain('home-hermes');
    });

    it('redacts URLs in free-text breadcrumb messages', () => {
      const event = {
        breadcrumbs: [
          {
            message: `Connected to ${URL}`,
            category: 'console',
          },
          {
            message: 'User sent a message',
            category: 'console',
          },
        ],
      };
      const scrubbed = scrubEvent(event) as { breadcrumbs: { message: string }[] };
      expect(scrubbed.breadcrumbs[0]!.message).not.toContain(URL);
      expect(scrubbed.breadcrumbs[0]!.message).toContain('[redacted]');
      expect(scrubbed.breadcrumbs[1]!.message).toBe('User sent a message');
    });

    it('redacts an apiKey embedded in a full Sentry event payload', () => {
      // Real Sentry event shape: event_id, timestamp, platform, exception, breadcrumbs, contexts, extra.
      const event = {
        event_id: 'evt_001',
        timestamp: 1690900000,
        platform: 'javascript',
        level: 'error',
        exception: {
          values: [
            {
              type: 'ApiError',
              value: `Auth failed for ${URL}`,
              mechanism: { handled: false },
            },
          ],
        },
        breadcrumbs: [
          {
            category: 'http',
            data: { url: `${URL}/v1/runs`, method: 'POST', Authorization: `Bearer ${KEY}` },
          },
          { category: 'navigation', message: 'Screen: chat' },
        ],
        contexts: {
          app: { app_identifier: 'com.clementine' },
        },
        extra: {
          baseUrl: URL,
          apiKey: KEY,
          runId: 'run_abc',
        },
        tags: { reason: 'auth' },
      };
      const scrubbed = scrubEvent(event);
      const json = JSON.stringify(scrubbed);

      expect(json).not.toContain(KEY);
      expect(json).not.toContain(URL);
      expect(json).toContain('[redacted]');
      // Diagnostic fields survive.
      expect(json).toContain('run_abc');
      expect(json).toContain('auth');
      expect(json).toContain('chat');
    });

    it('does not redact a hash fragment or data: URL appearing in non-sensitive context', () => {
      const event = {
        breadcrumbs: [
          {
            category: 'navigation',
            data: { from: '/chat#messages', to: '/setup' },
          },
        ],
      };
      const scrubbed = scrubEvent(event);
      const json = JSON.stringify(scrubbed);
      expect(json).toContain('/chat#messages');
    });
  });
});

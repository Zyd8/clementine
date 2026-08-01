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
});

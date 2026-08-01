import { ApiError } from './client';
import { CAPABILITIES_PATH, parseCapabilities, validateConnection } from './capabilities';

/**
 * Fixture captured verbatim from a live Hermes API server
 * (`GET /v1/capabilities` on hermes-agent, SDK-era 2026-08). Trimmed to the
 * fields the client reads — the shape, not the doc's assumed shape, is the
 * contract.
 */
const LIVE = {
  object: 'hermes.api_server.capabilities',
  platform: 'hermes-agent',
  model: 'hermes-agent',
  auth: { type: 'bearer', required: true },
  runtime: { mode: 'server_agent', tool_execution: 'server', split_runtime: false },
  features: {
    run_submission: true,
    run_status: true,
    run_events_sse: true,
    run_stop: true,
    run_approval_response: true,
    session_resources: true,
    session_chat: true,
    session_chat_streaming: true,
    session_fork: true,
    skills_api: true,
    cors: false,
  },
  endpoints: {
    runs: { method: 'POST', path: '/v1/runs' },
    run_events: { method: 'GET', path: '/v1/runs/{run_id}/events' },
    sessions: { method: 'GET', path: '/api/sessions' },
  },
};

describe('parseCapabilities', () => {
  it('accepts the live Hermes response', () => {
    expect(parseCapabilities(LIVE).platform).toBe('hermes-agent');
  });

  it('normalizes the feature flags the client actually branches on', () => {
    expect(parseCapabilities(LIVE)).toMatchObject({
      supportsRuns: true,
      supportsSse: true,
      supportsSessions: true,
      supportsApproval: true,
    });
  });

  it('reports profiles as unsupported when the host omits the flag', () => {
    // No Hermes host ships /v1/profiles yet — the client must degrade to a
    // single implicit profile rather than assume support.
    expect(parseCapabilities(LIVE).supportsProfiles).toBe(false);
  });

  it('reports profiles as supported once a host advertises them', () => {
    const withProfiles = {
      ...LIVE,
      features: { ...LIVE.features, profiles: true },
    };
    expect(parseCapabilities(withProfiles).supportsProfiles).toBe(true);
  });

  it('tolerates a host that omits optional feature flags entirely', () => {
    const sparse = { object: 'hermes.api_server.capabilities', platform: 'hermes-agent' };
    expect(parseCapabilities(sparse).supportsRuns).toBe(false);
  });

  it('rejects a JSON body from something that is not Hermes', () => {
    expect(() => parseCapabilities({ status: 'ok', service: 'nginx' })).toThrow(ApiError);
  });

  it('tags a non-Hermes body as not-hermes, not as a parse crash', () => {
    expect(() => parseCapabilities({ hello: 'world' })).toThrow(
      expect.objectContaining({ kind: 'not-hermes' }),
    );
  });

  it('rejects a null body', () => {
    expect(() => parseCapabilities(null)).toThrow(ApiError);
  });
});

describe('validateConnection', () => {
  const BASE = 'http://100.106.162.39:8642';
  const KEY = 'a3f1c09b8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b';

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(LIVE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
  });

  it('hits the capabilities endpoint', async () => {
    await validateConnection(BASE, KEY);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(`${BASE}${CAPABILITIES_PATH}`);
  });

  it('resolves with normalized capabilities on success', async () => {
    await expect(validateConnection(BASE, KEY)).resolves.toMatchObject({
      platform: 'hermes-agent',
      supportsRuns: true,
    });
  });

  it('surfaces a wrong key as an auth failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(validateConnection(BASE, KEY)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('surfaces an unreachable host as a network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await expect(validateConnection(BASE, KEY)).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('surfaces a reachable non-Hermes host as not-hermes', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ service: 'nginx' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(validateConnection(BASE, KEY)).rejects.toMatchObject({
      kind: 'not-hermes',
    });
  });
});

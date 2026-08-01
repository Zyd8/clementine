import { normalizeBaseUrl } from '@/types/connection';

/**
 * The single HTTP client factory. No React, no UI imports.
 *
 * Its main job beyond auth injection is turning every failure into a
 * *distinguishable* kind. The setup screen is the reason: "wrong key",
 * "unreachable host", and "reachable but not a Hermes" are three completely
 * different things for a user to fix, and collapsing them into "request
 * failed" is what makes BYO-endpoint onboarding miserable.
 */

export type ApiErrorKind =
  | 'auth' // 401/403 — key is wrong or revoked
  | 'not-hermes' // reachable, but not the API we expect
  | 'server' // 5xx — Hermes is there and unwell
  | 'network' // DNS/refused/offline — never reached the host
  | 'timeout'; // reached nothing in time

const MESSAGES: Record<ApiErrorKind, string> = {
  auth: 'That API key was rejected. Check CLEMENTINE_API_KEY on your Hermes host.',
  'not-hermes':
    "That URL answered, but it doesn't look like a Hermes API server. Check the port (default 8642).",
  server: 'The Hermes instance returned an error. Check that its gateway is healthy.',
  network:
    "Couldn't reach that address. Check the URL, and that the phone is on the same network (LAN or Tailscale).",
  timeout: 'That address took too long to respond. Check the host is awake and reachable.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, status?: number) {
    // Never interpolate the credential or the URL into the message — this
    // string reaches logs and, if telemetry is on, `scrubEvent`.
    super(MESSAGES[kind]);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

function mapStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  // 404 and other 4xx: something is listening, but not the expected API.
  return 'not-hermes';
}

function mapThrown(error: unknown): ApiErrorKind {
  return error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
}

export type Client = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
};

export function makeClient(
  baseUrl: string,
  credential: string,
  options: { timeoutMs?: number } = {},
): Client {
  const root = normalizeBaseUrl(baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${root}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ApiError(mapThrown(error));
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new ApiError(mapStatus(response.status), response.status);

    try {
      return (await response.json()) as T;
    } catch {
      // 200 with a non-JSON body means we're talking to something else
      // entirely — a captive portal, a web server, the wrong port.
      throw new ApiError('not-hermes', response.status);
    }
  }

  return {
    get: (path) => request(path, { method: 'GET' }),
    post: (path, body) =>
      request(path, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

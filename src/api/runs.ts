import * as Sentry from '@sentry/react-native';

import { normalizeEvent, type StreamEvent, type TokenUsage } from '@/types/events';

import { ApiError, makeClient } from './client';
import { createSseParser } from './sse';

/**
 * The Runs API — the main chat path. Long-form, detachable, reconnect-safe.
 *
 * Shapes confirmed against a live Hermes API server: `POST /v1/runs` answers
 * **202** with `{ run_id, status }`, and `GET /v1/runs/{id}` returns
 * `{ status, output?, usage? }` — the reconciliation source after a dropped
 * stream.
 */

export type RunStatus = 'started' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RunHandle = { runId: string; status: RunStatus };

export type RunState = {
  runId: string;
  status: RunStatus;
  output?: string;
  usage?: TokenUsage;
};

export async function createRun(
  baseUrl: string,
  credential: string,
  { input, sessionId }: { input: string; sessionId?: string },
): Promise<RunHandle> {
  const body = await makeClient(baseUrl, credential).post<{
    run_id: string;
    status?: RunStatus;
  }>('/v1/runs', { input, ...(sessionId ? { session_id: sessionId } : {}) });

  return { runId: body.run_id, status: body.status ?? 'started' };
}

export async function getRun(
  baseUrl: string,
  credential: string,
  runId: string,
): Promise<RunState> {
  const body = await makeClient(baseUrl, credential).get<{
    run_id: string;
    status: RunStatus;
    output?: string;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  }>(`/v1/runs/${runId}`);

  return {
    runId: body.run_id,
    status: body.status,
    ...(body.output === undefined ? {} : { output: body.output }),
    ...(body.usage
      ? {
          usage: {
            inputTokens: body.usage.input_tokens,
            outputTokens: body.usage.output_tokens,
            totalTokens: body.usage.total_tokens,
          },
        }
      : {}),
  };
}

export async function stopRun(
  baseUrl: string,
  credential: string,
  runId: string,
): Promise<void> {
  await makeClient(baseUrl, credential).post(`/v1/runs/${runId}/stop`);
}

export async function resolveApproval(
  baseUrl: string,
  credential: string,
  runId: string,
  approved: boolean,
): Promise<void> {
  await makeClient(baseUrl, credential).post(`/v1/runs/${runId}/approval`, { approved });
}

/**
 * Subscribes to a run's SSE stream.
 *
 * An async generator rather than a callback so the consumer controls
 * backpressure and cancellation: breaking out of the `for await` cancels the
 * underlying reader, which is exactly what "user navigated away mid-run"
 * needs to do.
 *
 * Note the fetch here is deliberately NOT the shared client: SSE must not
 * carry the client's request timeout, since a healthy stream is idle by
 * design between events.
 */
export async function* streamRunEvents(
  baseUrl: string,
  credential: string,
  runId: string,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const root = baseUrl.replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${root}/v1/runs/${runId}/events`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${credential}`, Accept: 'text/event-stream' },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 401 || response.status === 403
        ? 'auth'
        : response.status >= 500
          ? 'server'
          : 'not-hermes',
      response.status,
    );
  }

  const body = response.body;
  if (!body) throw new ApiError('not-hermes', response.status);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const frames = parser.push(decoder.decode(value, { stream: true }));
      for (const frame of frames) {
        let payload: unknown;
        try {
          payload = JSON.parse(frame.data);
        } catch (err) {
          // Phase 6: a malformed frame is a stream defect worth knowing about
          // — tag it so the error dashboard distinguishes it from auth/network.
          Sentry.captureException(
            err instanceof Error ? err : new Error(String(err)),
            { tags: { reason: 'parse' } },
          );
          continue;
        }
        const event = normalizeEvent(payload);
        if (event) yield event;
      }
    }

    for (const frame of parser.flush()) {
      try {
        const event = normalizeEvent(JSON.parse(frame.data));
        if (event) yield event;
      } catch {
        // Same tolerance for a truncated final frame.
      }
    }
  } finally {
    // Runs on `break`/`return` too — releases the socket promptly.
    await reader.cancel().catch(() => undefined);
  }
}

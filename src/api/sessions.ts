import { normalizeEvent, type StreamEvent } from '@/types/events';
import type { SessionMessage, SessionSummary } from '@/types/sessions';

import { ApiError, makeClient } from './client';
import { createSseParser } from './sse';

/**
 * Sessions API — list, create, fork, message history, and follow-up chat.
 *
 * Path B from ARCHITECTURE.md: `POST /api/sessions/{id}/chat/stream` drives a
 * single agent turn over SSE, emitting the same event shapes as the Runs API.
 * The client normalises them through `normalizeEvent` so the UI reuses
 * `Bubble` / `ToolCallCard` without a second rendering path.
 *
 * `SessionSummary` / `SessionMessage` live in `@/types/sessions` (UI-facing
 * shapes); re-exported here for callers that already import from the API
 * layer. Components should import from `@/types/sessions` directly.
 */

export type { SessionMessage, SessionSummary } from '@/types/sessions';

type WireSession = {
  id: string;
  title: string;
  preview?: string;
  last_message_at: string;
  message_count: number;
  parent_id?: string;
  branch_index?: number;
};

type WireMessage = {
  role: string;
  content: string;
  timestamp?: string;
  tool?: string;
  ok?: boolean;
  duration?: number;
};

function normalizeSession(w: WireSession): SessionSummary {
  return {
    id: w.id,
    title: w.title,
    preview: w.preview ?? '',
    lastMessageAt: w.last_message_at,
    messageCount: w.message_count,
    ...(w.parent_id === undefined ? {} : { parentId: w.parent_id }),
    ...(w.branch_index === undefined ? {} : { branchIndex: w.branch_index }),
  };
}

function normalizeMessage(w: WireMessage): SessionMessage {
  return {
    role: w.role as SessionMessage['role'],
    content: w.content,
    ...(w.timestamp === undefined ? {} : { timestamp: w.timestamp }),
    ...(w.tool === undefined ? {} : { tool: w.tool }),
    ...(w.ok === undefined ? {} : { ok: w.ok }),
    ...(w.duration === undefined ? {} : { durationMs: w.duration }),
  };
}

export type SessionsList = { sessions: SessionSummary[] };

export async function listSessions(
  baseUrl: string,
  credential: string,
  { limit, offset }: { limit: number; offset: number },
): Promise<SessionsList> {
  const client = makeClient(baseUrl, credential);
  const body = await client.get<{ sessions: WireSession[] }>(
    `/api/sessions?limit=${limit}&offset=${offset}`,
  );
  return { sessions: body.sessions.map(normalizeSession) };
}

export async function createSession(
  baseUrl: string,
  credential: string,
  { title }: { title?: string } = {},
): Promise<SessionSummary> {
  const body = await makeClient(baseUrl, credential).post<WireSession>(
    '/api/sessions',
    title ? { title } : undefined,
  );
  return normalizeSession(body);
}

export async function getSessionMessages(
  baseUrl: string,
  credential: string,
  sessionId: string,
): Promise<{ messages: SessionMessage[] }> {
  const body = await makeClient(baseUrl, credential).get<{ messages: WireMessage[] }>(
    `/api/sessions/${sessionId}/messages`,
  );
  return { messages: body.messages.map(normalizeMessage) };
}

export async function forkSession(
  baseUrl: string,
  credential: string,
  sessionId: string,
): Promise<SessionSummary> {
  const body = await makeClient(baseUrl, credential).post<WireSession>(
    `/api/sessions/${sessionId}/fork`,
  );
  return normalizeSession(body);
}

/**
 * Streams a follow-up turn for an existing session.
 *
 * Same async-generator contract as `streamRunEvents` so the hook can consume
 * both paths identically.
 */
export async function* streamSessionChat(
  baseUrl: string,
  credential: string,
  sessionId: string,
  input: string,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const root = baseUrl.replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${root}/api/sessions/${sessionId}/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
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
        } catch {
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
    await reader.cancel().catch(() => undefined);
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import {
  createSession,
  forkSession as forkSessionApi,
  getSessionMessages,
  listSessions,
  streamSessionChat,
  type SessionSummary,
} from '@/api/sessions';
import { useChatStore, type ProfileId } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';

/**
 * Session list + resume + fork + new, keyed by `profileId | null`.
 *
 * Resume loads the session's message history into the chat store so the chat
 * surface can render a scrollback, then routes to `chat/[sessionId].tsx`.
 * Follow-ups go through `streamSessionChat` (Path B) — the same SSE event
 * normalisation path as the Runs API so `Bubble`/`ToolCallCard` are reused.
 */

const GENERIC_FAILURE = 'The stream dropped mid-turn.';

export function useSessions(profileId: ProfileId = null) {
  const connection = useConnectionStore((s) => s.connection);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  // Initial load starts in the loading state (mount fetch must not call
  // setState synchronously from the effect — the initial value covers it).
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const inFlight = useRef(false);

  // ---- list ----

  // Pure loader: returns data, sets no state. Used by both the mount effect
  // and `refresh` — state application stays in the callers.
  const loadSessions = useCallback(async () => {
    if (!connection) return { sessions: [] as SessionSummary[] };
    return listSessions(connection.baseUrl, connection.apiKey, {
      limit: 50,
      offset: 0,
    });
  }, [connection]);

  // Load on mount (and whenever the connection changes). setState only in
  // promise callbacks, never synchronously in the effect body — keeps
  // react-hooks/set-state-in-effect happy without deferring the fetch.
  useEffect(() => {
    let cancelled = false;
    void loadSessions()
      .then((result) => {
        if (!cancelled) setSessions(result.sessions);
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err instanceof ApiError ? err.message : 'Failed to load sessions.';
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  // ---- resume ----

  const resume = useCallback(
    async (sessionId: string) => {
      if (!connection) return;
      setResumingSessionId(sessionId);

      try {
        const { messages } = await getSessionMessages(
          connection.baseUrl,
          connection.apiKey,
          sessionId,
        );

        useChatStore.getState().hydrateFromMessages(profileId, messages);
        activeSessionId.current = sessionId;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to load session.';
        setError(message);
      } finally {
        setResumingSessionId(null);
      }
    },
    [connection, profileId],
  );

  // ---- follow-up send ----

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || !connection || inFlight.current) return;

      const sid = activeSessionId.current;
      if (!sid) return;

      // Only allow send when we're in a resumed session (feed is non-empty).
      const feed = useChatStore.getState().feed(profileId);
      if (feed.length === 0) return;

      inFlight.current = true;
      useChatStore.getState().appendUserMessage(profileId, text);

      try {
        for await (const event of streamSessionChat(
          connection.baseUrl,
          connection.apiKey,
          sid,
          text,
        )) {
          useChatStore.getState().applyEvent(profileId, event);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : GENERIC_FAILURE;
        useChatStore.getState().applyEvent(profileId, { type: 'run.failed', message });
      } finally {
        inFlight.current = false;
      }
    },
    [connection, profileId],
  );

  // ---- refresh ----

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadSessions();
      setSessions(result.sessions);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load sessions.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadSessions]);

  // ---- fork ----

  const fork = useCallback(
    async (sessionId: string) => {
      if (!connection) return;
      await forkSessionApi(connection.baseUrl, connection.apiKey, sessionId);
      await refresh();
    },
    [connection, refresh],
  );

  // ---- startNew ----

  const startNew = useCallback(async () => {
    if (!connection) return;
    await createSession(connection.baseUrl, connection.apiKey, {});
    useChatStore.getState().reset(profileId);
  }, [connection, profileId]);

  return {
    sessions,
    isLoading,
    error,
    resumingSessionId,
    resume,
    send,
    fork,
    refresh,
    startNew,
  };
}

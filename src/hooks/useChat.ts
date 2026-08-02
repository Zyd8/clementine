import * as Sentry from '@sentry/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import { createRun, getRun, stopRun, streamRunEvents } from '@/api/runs';
import { getSessionMessages, listSessions } from '@/api/sessions';
import { useChatStore, type ProfileId } from '@/stores/chat';
import { useUsageStore } from '@/stores/usage';
import { useConnectionStore } from '@/stores/connection';

/**
 * The turn lifecycle: create run → subscribe to SSE → accumulate → settle.
 *
 * Optimistic UI covers the user's own message and nothing else; every token
 * of the agent's reply comes from the stream.
 *
 * **Reconnect semantics (decided, not implicit).** Hermes sends no
 * `Last-Event-ID` and offers no event replay, so there is no way to resume a
 * stream mid-run. On a drop we poll `GET /v1/runs/{id}` once and reconcile
 * against the authoritative `output`: the partially streamed bubble is
 * *replaced*, not appended to. That accepts a visible jump in the text over
 * the alternative of duplicating what the user already read. If the run is
 * still running when we poll, we surface an error rather than silently
 * hanging — the client genuinely cannot re-attach today.
 *
 * **Session continuity.** `POST /v1/runs` continues an existing session when
 * given one, but a fresh `createRun` call with none creates a brand-new one —
 * which used to happen on every app open, since nothing ever remembered a
 * session id. On mount, with an empty local feed, this looks up the most
 * recent session and loads its history, so reopening the app continues the
 * last conversation instead of starting a new one. A profile with no prior
 * session at all learns its first one the same way, right after the first
 * message completes, so every send after that also lands in the same place.
 */

const GENERIC_FAILURE = 'The connection dropped mid-run.';

export function useChat(profileId: ProfileId = null) {
  const connection = useConnectionStore((s) => s.connection);
  const [isStreaming, setIsStreaming] = useState(false);
  // A ref, not state: `send` must see the current value synchronously to
  // reject a second submit in the same tick.
  const inFlight = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const resumeAttempted = useRef(false);

  // Best-effort: any failure here just leaves the chat starting fresh, the
  // same as before this existed. Guarded to run once per mount, and only
  // when nothing is loaded yet — a remount with an already-populated feed
  // (switching tabs and back) must not stomp what's on screen.
  useEffect(() => {
    if (!connection || resumeAttempted.current) return;
    resumeAttempted.current = true;
    if (useChatStore.getState().feed(profileId).length > 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const { sessions } = await listSessions(connection.baseUrl, connection.apiKey, {
          limit: 1,
          offset: 0,
        });
        const last = sessions[0];
        if (!last || cancelled) return;

        const { messages } = await getSessionMessages(
          connection.baseUrl,
          connection.apiKey,
          last.id,
        );
        if (cancelled) return;

        useChatStore.getState().hydrateFromMessages(profileId, messages);
        sessionIdRef.current = last.id;
      } catch {
        // No prior session to resume, or the lookup failed — starts fresh.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, profileId]);

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || inFlight.current || !connection) return;

      const store = useChatStore.getState();
      inFlight.current = true;
      setIsStreaming(true);
      store.appendUserMessage(profileId, text);

      const { baseUrl, apiKey } = connection;
      let runId: string | undefined;

      try {
        const handle = await createRun(baseUrl, apiKey, {
          input: text,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        });
        runId = handle.runId;
        store.setActiveRun(profileId, runId);

        for await (const event of streamRunEvents(baseUrl, apiKey, runId)) {
          useChatStore.getState().applyEvent(profileId, event);
          // Phase 6: push usage into the persistent store on every
          // completed run so the chat header reflects total tokens.
          if (event.type === 'run.completed' && event.usage) {
            useUsageStore.getState().addUsage(profileId, event.usage);
          }
        }

        // First-ever message for this profile: nothing existed to resume on
        // mount, so nothing is known to continue yet. Learn it now so every
        // send after this one lands in the same session instead of each one
        // spinning up its own.
        if (!sessionIdRef.current) {
          try {
            const { sessions } = await listSessions(baseUrl, apiKey, {
              limit: 1,
              offset: 0,
            });
            if (sessions[0]) sessionIdRef.current = sessions[0].id;
          } catch {
            // Best-effort — a miss here just means the next message also
            // starts its own session, same as before this existed.
          }
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : GENERIC_FAILURE;

        // Phase 6: tag and report SSE stream errors so failures on a phone
        // you can't SSH into actually reach a dashboard.
        const reason =
          error instanceof ApiError
            ? error.kind
            : 'stream';
        Sentry.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { tags: { reason } },
        );

        // The stream dropped after the run started — reconcile from the server.
        if (runId) {
          await reconcile(baseUrl, apiKey, runId, profileId, message);
        } else {
          useChatStore
            .getState()
            .applyEvent(profileId, { type: 'run.failed', message });
        }
      } finally {
        inFlight.current = false;
        setIsStreaming(false);
        useChatStore.getState().setActiveRun(profileId, null);
      }
    },
    [connection, profileId],
  );

  const stop = useCallback(async () => {
    const runId = useChatStore.getState().activeRun(profileId);
    if (!connection || !runId) return;
    await stopRun(connection.baseUrl, connection.apiKey, runId).catch(() => undefined);
  }, [connection, profileId]);

  return { send, stop, isStreaming };
}

/** Poll the run once and replace the partial bubble with the real output. */
async function reconcile(
  baseUrl: string,
  apiKey: string,
  runId: string,
  profileId: ProfileId,
  dropMessage: string,
): Promise<void> {
  const store = useChatStore.getState();

  let state;
  try {
    state = await getRun(baseUrl, apiKey, runId);
  } catch {
    store.applyEvent(profileId, { type: 'run.failed', message: dropMessage });
    return;
  }

  if (state.status === 'completed' && state.output !== undefined) {
    // The store owns the "drop the partial bubble, apply the real output"
    // transition — the hook has no business rewriting feed internals.
    store.reconcileCompletion(profileId, state.output, state.usage);
    if (state.usage) {
      useUsageStore.getState().addUsage(profileId, state.usage);
    }
    return;
  }

  store.applyEvent(profileId, {
    type: 'run.failed',
    message:
      state.status === 'failed'
        ? 'The run failed on the server.'
        : `${dropMessage} The run may still be going on the server.`,
  });
}

import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import { createRun, getRun, stopRun, streamRunEvents } from '@/api/runs';
import { useChatStore, type ProfileId } from '@/stores/chat';
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
 */

const GENERIC_FAILURE = 'The connection dropped mid-run.';

export function useChat(profileId: ProfileId = null) {
  const connection = useConnectionStore((s) => s.connection);
  const [isStreaming, setIsStreaming] = useState(false);
  // A ref, not state: `send` must see the current value synchronously to
  // reject a second submit in the same tick.
  const inFlight = useRef(false);

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
        const handle = await createRun(baseUrl, apiKey, { input: text });
        runId = handle.runId;
        store.setActiveRun(profileId, runId);

        for await (const event of streamRunEvents(baseUrl, apiKey, runId)) {
          useChatStore.getState().applyEvent(profileId, event);
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : GENERIC_FAILURE;

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

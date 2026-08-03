import { useCallback, useState } from 'react';

import { validateConnection } from '@/api/capabilities';
import { ApiError } from '@/api/client';
import { useReconfigure } from '@/hooks/useConnectionActions';
import { setupFormSchema, type SetupFormValues } from '@/types/connection';

/**
 * The setup screen's brain: validate against the live instance, then save.
 *
 * Nothing is persisted until `GET /v1/capabilities` succeeds — a connection
 * that was never proven to work is worse than no connection, because the app
 * boots into a chat screen that can only fail.
 */

export type SetupStatus = 'idle' | 'validating' | 'success' | 'error';

const FALLBACK_ERROR = 'Something went wrong connecting. Check the URL and key, then retry.';

export function useConnectionSetup() {
  const [status, setStatus] = useState<SetupStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const reconfigure = useReconfigure();

  const submit = useCallback(async (values: SetupFormValues): Promise<boolean> => {
    setError(null);

    // Local validation first — a malformed URL should never cost a round trip.
    const parsed = setupFormSchema.safeParse(values);
    if (!parsed.success) {
      setStatus('error');
      setError(parsed.error.issues[0]?.message ?? FALLBACK_ERROR);
      return false;
    }

    const { baseUrl, apiKey, name } = parsed.data;
    setStatus('validating');

    try {
      await validateConnection(baseUrl, apiKey);
    } catch (cause) {
      setStatus('error');
      // ApiError messages are already user-facing and credential-free.
      setError(cause instanceof ApiError ? cause.message : FALLBACK_ERROR);
      return false;
    }

    // `reconfigure` wipes any prior credential (and any prior instance's
    // profiles/feed/usage) before writing the new one; with no prior
    // connection it is simply a connect.
    await reconfigure({
      ...(name ? { name } : {}),
      baseUrl,
      apiKey,
      connectedAt: Date.now(),
    });

    setStatus('success');
    return true;
  }, [reconfigure]);

  return { status, error, submit };
}

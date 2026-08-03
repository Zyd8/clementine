import { useCallback } from 'react';

import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';
import { useUsageStore } from '@/stores/usage';
import type { Connection } from '@/types/connection';

/**
 * Wipes profiles (and their avatars), the chat feed/session, and usage
 * totals — every piece of local state scoped to the Hermes instance being
 * left, not the one about to be connected. `stores/` may not depend on
 * other `stores/` (see ARCHITECTURE.md's dependency direction), so this
 * orchestration lives here instead of inside `connection.ts` itself.
 *
 * Without this, disconnecting from one instance and connecting to a
 * different one kept showing the previous instance's profile list and
 * avatar — reading as still being logged into the old account.
 */
async function wipeInstanceScopedState(): Promise<void> {
  await useProfilesStore.getState().resetAll();
  useChatStore.getState().resetAll();
  useUsageStore.getState().resetAll();
}

/** What the "disconnect" affordance actually calls — see `profiles.tsx`. */
export function useDisconnect() {
  return useCallback(async () => {
    await useConnectionStore.getState().disconnect();
    await wipeInstanceScopedState();
  }, []);
}

/**
 * What `useConnectionSetup`'s submit actually calls to swap instances. Not
 * `useConnectionStore.getState().reconfigure()` directly — that call is
 * disconnect-then-connect with no room to wipe the other stores in between.
 * Mirrors its ordering instead: old credential wiped before the new one is
 * written, so a crash mid-swap still can't leave a half-replaced connection.
 */
export function useReconfigure() {
  return useCallback(async (connection: Connection) => {
    await useConnectionStore.getState().disconnect();
    await wipeInstanceScopedState();
    await useConnectionStore.getState().connect(connection);
  }, []);
}

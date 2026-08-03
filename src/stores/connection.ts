import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { connectionSchema, type Connection } from '@/types/connection';

/**
 * The one configured Hermes instance.
 *
 * SecureStore only — the API key IS agent access (terminal included), so it
 * never goes near AsyncStorage, the bundle, or telemetry. There is no list
 * and no `id`: connecting replaces whatever was there before.
 */
export const CONNECTION_STORAGE_KEY = 'clementine.connection';

type ConnectionState = {
  connection: Connection | null;
  /** False until `hydrate()` runs, so routing can wait instead of guessing. */
  hydrated: boolean;
  connect: (connection: Connection) => Promise<void>;
  reconfigure: (connection: Connection) => Promise<void>;
  disconnect: () => Promise<void>;
  touch: (at: number) => Promise<void>;
  hydrate: () => Promise<void>;
};

const persist = (connection: Connection) =>
  SecureStore.setItemAsync(CONNECTION_STORAGE_KEY, JSON.stringify(connection));

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connection: null,
  hydrated: false,

  connect: async (connection) => {
    set({ connection, hydrated: true });
    await persist(connection);
  },

  /**
   * Replace the instance entirely. The heavy action: the old credential is
   * wiped *before* the new one is written, so a crash mid-swap can never
   * leave a half-replaced connection behind.
   *
   * This store only owns the credential itself — profiles, the chat feed,
   * and usage totals are separate stores that also need wiping on a real
   * instance change (see `useDisconnect`/`useReconfigure` in
   * `hooks/useConnectionActions.ts`, which is what the app actually calls).
   * `stores/` may not depend on other `stores/` (see ARCHITECTURE.md's
   * dependency direction), so that orchestration can't live here.
   */
  reconfigure: async (connection) => {
    await get().disconnect();
    await get().connect(connection);
  },

  disconnect: async () => {
    // Purely local. The app never modifies the machine it talks to — only
    // itself — so there is deliberately no request here.
    set({ connection: null, hydrated: true });
    await SecureStore.deleteItemAsync(CONNECTION_STORAGE_KEY);
  },

  touch: async (at) => {
    const current = get().connection;
    if (!current) return;
    const updated = { ...current, lastUsedAt: at };
    set({ connection: updated });
    await persist(updated);
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(CONNECTION_STORAGE_KEY);
      if (!raw) {
        set({ connection: null, hydrated: true });
        return;
      }
      // A blob that no longer parses or validates is treated as absent:
      // showing setup beats booting into a half-broken connection.
      const parsed = connectionSchema.safeParse(JSON.parse(raw));
      set({ connection: parsed.success ? parsed.data : null, hydrated: true });
    } catch {
      set({ connection: null, hydrated: true });
    }
  },
}));

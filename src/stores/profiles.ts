import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { ProfileId } from '@/utils/profile';

/**
 * Profiles — the switchable unit within the one connected Hermes instance.
 *
 * These are LOCAL labels, not server objects. The backend was verified on
 * 2026-08-02 to have no profile endpoints (`/v1/profiles` → 404, no
 * `profiles` capability flag); the real host mechanism is URL-prefix
 * multiplexing, which no shipping instance enables yet. What the design asks
 * for — name a profile, give it a two-letter avatar, switch between them — is
 * entirely client-side, and it works today because `stores/chat` and
 * `stores/usage` already key everything by `profileId | null`. Switching a
 * profile therefore partitions the feed and the token totals for real.
 *
 * Not secret, so AsyncStorage: these are display labels. The connection key
 * and voice credentials stay in SecureStore.
 */

export const PROFILES_STORAGE_KEY = 'clementine.profiles';

/** The implicit profile every host has. Maps to the `null` profile key. */
export const DEFAULT_PROFILE_ID = 'default';

export type Profile = { id: string; name: string; avatar: string };

type ProfilesState = {
  profiles: Profile[];
  activeId: string;
  hydrated: boolean;

  /** The key `stores/chat` and `stores/usage` partition by. */
  activeProfileId: () => ProfileId;

  add: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  setAvatar: (id: string, avatar: string) => Promise<void>;
  select: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
  /**
   * Back to just the implicit default profile — used when the connection
   * itself changes. Profiles (and their avatars) are labels for accounts on
   * ONE Hermes instance; without this, switching to a different instance
   * kept showing the old instance's profile list and avatar, which reads as
   * still being logged into the old account.
   */
  resetAll: () => Promise<void>;
};

/**
 * Two uppercase characters, as the design's `maxlength=2` input implies.
 * A `file://` URI is an uploaded avatar image and must pass through intact.
 */
const toAvatar = (source: string): string =>
  source.startsWith('file://') ? source : source.slice(0, 2).toUpperCase();

const implicitProfile = (): Profile => ({
  id: DEFAULT_PROFILE_ID,
  name: DEFAULT_PROFILE_ID,
  avatar: toAvatar(DEFAULT_PROFILE_ID),
});

const isProfile = (value: unknown): value is Profile =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Profile).id === 'string' &&
  typeof (value as Profile).name === 'string' &&
  typeof (value as Profile).avatar === 'string';

export const useProfilesStore = create<ProfilesState>((set, get) => {
  const persist = async () => {
    const { profiles, activeId } = get();
    await AsyncStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify({ profiles, activeId }),
    );
  };

  const update = async (next: (profiles: Profile[]) => Profile[]) => {
    set((state) => ({ profiles: next(state.profiles) }));
    await persist();
  };

  return {
    profiles: [implicitProfile()],
    activeId: DEFAULT_PROFILE_ID,
    hydrated: false,

    // The implicit profile is the `null` key the other stores already use, so
    // adopting this store does not orphan existing feeds or token totals.
    activeProfileId: () => {
      const { activeId } = get();
      return activeId === DEFAULT_PROFILE_ID ? null : activeId;
    },

    add: async (name) => {
      const profile: Profile = {
        id: `p_${Date.now().toString(36)}`,
        name,
        avatar: toAvatar(name),
      };
      await update((profiles) => [...profiles, profile]);
    },

    rename: async (id, name) =>
      update((profiles) => profiles.map((p) => (p.id === id ? { ...p, name } : p))),

    setAvatar: async (id, avatar) =>
      update((profiles) =>
        profiles.map((p) => (p.id === id ? { ...p, avatar: toAvatar(avatar) } : p)),
      ),

    select: async (id) => {
      // Switching to a profile that no longer exists would key the chat store
      // to a feed nothing can write to; stay put instead.
      if (!get().profiles.some((p) => p.id === id)) return;
      set({ activeId: id });
      await persist();
    },

    resetAll: async () => {
      set({ profiles: [implicitProfile()], activeId: DEFAULT_PROFILE_ID });
      await persist();
    },

    hydrate: async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
        const parsed: unknown = raw === null ? null : JSON.parse(raw);
        const profiles =
          typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { profiles?: unknown }).profiles)
            ? (parsed as { profiles: unknown[] }).profiles.filter(isProfile)
            : [];
        const activeId = (parsed as { activeId?: unknown } | null)?.activeId;

        const resolved = profiles.length > 0 ? profiles : [implicitProfile()];
        set({
          profiles: resolved,
          activeId:
            typeof activeId === 'string' && resolved.some((p) => p.id === activeId)
              ? activeId
              : DEFAULT_PROFILE_ID,
          hydrated: true,
        });
      } catch {
        // Corrupt storage must not block boot on a display label.
        set({
          profiles: [implicitProfile()],
          activeId: DEFAULT_PROFILE_ID,
          hydrated: true,
        });
      }
    },
  };
});

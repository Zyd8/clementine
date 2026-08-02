import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { TokenUsage } from '@/types/events';
import { profileKey, type ProfileId } from '@/utils/profile';

/**
 * Persistent token-usage tracker, keyed by profileId|null.
 *
 * This is NOT the chat store's per-session `usage` — it persists across
 * app restarts via AsyncStorage. It accumulates a simple running total per
 * profile: no time-window bucketing, no budget math, no per-model breakdown.
 *
 * MINIMAL by design — the full usage dashboard was trimmed from this phase
 * for a single-user app (see plan/06-usage-telemetry.md).
 */

type UsageState = {
  byProfile: Record<string, TokenUsage>;
  addUsage: (profileId: ProfileId, usage: TokenUsage) => void;
  total: (profileId: ProfileId) => TokenUsage;
  reset: (profileId: ProfileId) => void;
};

const ZERO: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      byProfile: {},

      addUsage: (profileId, usage) =>
        set((state) => {
          const key = profileKey(profileId);
          const prev = state.byProfile[key] ?? { ...ZERO };
          return {
            byProfile: {
              ...state.byProfile,
              [key]: {
                inputTokens: prev.inputTokens + usage.inputTokens,
                outputTokens: prev.outputTokens + usage.outputTokens,
                totalTokens: prev.totalTokens + usage.totalTokens,
              },
            },
          };
        }),

      total: (profileId) => {
        const key = profileKey(profileId);
        return get().byProfile[key] ?? { ...ZERO };
      },

      reset: (profileId) =>
        set((state) => {
          const { [profileKey(profileId)]: _, ...rest } = state.byProfile;
          return { byProfile: rest };
        }),
    }),
    {
      name: 'clementine.usage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

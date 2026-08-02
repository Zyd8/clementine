import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Daily token budget for the connected instance.
 *
 * A non-blocking warning only, as the design's own caption says: the app
 * cannot cap what the server spends. It exists so a runaway agent is visible
 * before the bill is, not to enforce anything.
 */

export const BUDGET_STORAGE_KEY = 'clementine.budget.dailyLimit';

/** The design's seeded limit. */
export const DEFAULT_DAILY_LIMIT = 150_000;

/** The design shows the banner at 90% of the limit, not at 100%. */
const WARN_FRACTION = 0.9;

type BudgetState = {
  dailyLimit: number;
  hydrated: boolean;
  isOverBudget: (usedTokens: number) => boolean;
  setLimit: (limit: number) => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useBudgetStore = create<BudgetState>((set, get) => ({
  dailyLimit: DEFAULT_DAILY_LIMIT,
  hydrated: false,

  isOverBudget: (usedTokens) => {
    const { dailyLimit } = get();
    // A zero limit means "not set". Treating it as exceeded would pin the
    // warning banner open permanently.
    if (dailyLimit <= 0) return false;
    return usedTokens >= dailyLimit * WARN_FRACTION;
  },

  setLimit: async (limit) => {
    const safe = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
    set({ dailyLimit: safe });
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, String(safe));
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
      const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
      set({
        dailyLimit: Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT,
        hydrated: true,
      });
    } catch {
      set({ dailyLimit: DEFAULT_DAILY_LIMIT, hydrated: true });
    }
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useBudgetStore, DEFAULT_DAILY_LIMIT, BUDGET_STORAGE_KEY } from './budget';

describe('budget store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useBudgetStore.setState({ dailyLimit: DEFAULT_DAILY_LIMIT, hydrated: true });
  });

  it('defaults to the design’s 150K daily limit', () => {
    expect(useBudgetStore.getState().dailyLimit).toBe(150_000);
  });

  it('stores a new limit', async () => {
    await useBudgetStore.getState().setLimit(200_000);
    expect(useBudgetStore.getState().dailyLimit).toBe(200_000);
  });

  /** The design warns at 90% of the limit, not at the limit itself. */
  it('warns once usage reaches 90% of the limit', () => {
    const { isOverBudget } = useBudgetStore.getState();
    expect(isOverBudget(134_999)).toBe(false);
    expect(isOverBudget(135_000)).toBe(true);
    expect(isOverBudget(142_300)).toBe(true);
  });

  it('never warns while the limit is zero — that means unset, not exceeded', () => {
    useBudgetStore.setState({ dailyLimit: 0 });
    expect(useBudgetStore.getState().isOverBudget(999_999)).toBe(false);
  });

  it('persists across a restart', async () => {
    await useBudgetStore.getState().setLimit(50_000);
    useBudgetStore.setState({ dailyLimit: DEFAULT_DAILY_LIMIT, hydrated: false });
    await useBudgetStore.getState().hydrate();
    expect(useBudgetStore.getState().dailyLimit).toBe(50_000);
  });

  it('falls back to the default when storage holds junk', async () => {
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, 'banana');
    useBudgetStore.setState({ dailyLimit: 1, hydrated: false });
    await useBudgetStore.getState().hydrate();
    expect(useBudgetStore.getState().dailyLimit).toBe(DEFAULT_DAILY_LIMIT);
    expect(useBudgetStore.getState().hydrated).toBe(true);
  });
});

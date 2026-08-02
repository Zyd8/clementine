import { useUsageStore } from './usage';

const P = null;

describe('usage store', () => {
  beforeEach(() => {
    useUsageStore.getState().reset(P);
    useUsageStore.getState().reset('work');
  });

  it('starts with zero usage', () => {
    const total = useUsageStore.getState().total(P);
    expect(total).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it('accumulates usage from a single run', () => {
    useUsageStore.getState().addUsage(P, {
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
    expect(useUsageStore.getState().total(P)).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
  });

  it('accumulates usage across multiple runs', () => {
    const store = useUsageStore.getState();
    store.addUsage(P, { inputTokens: 10, outputTokens: 2, totalTokens: 12 });
    store.addUsage(P, { inputTokens: 5, outputTokens: 1, totalTokens: 6 });
    expect(store.total(P)).toEqual({
      inputTokens: 15,
      outputTokens: 3,
      totalTokens: 18,
    });
  });

  it('isolates usage per profile', () => {
    useUsageStore.getState().addUsage('work', {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    });
    expect(useUsageStore.getState().total('work')).toMatchObject({
      totalTokens: 2,
    });
    expect(useUsageStore.getState().total(null)).toMatchObject({
      totalTokens: 0,
    });
  });

  it('resets one profile without touching another', () => {
    const store = useUsageStore.getState();
    store.addUsage(null, { inputTokens: 5, outputTokens: 1, totalTokens: 6 });
    store.addUsage('work', {
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
    store.reset(null);
    expect(store.total(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    expect(store.total('work')).toMatchObject({ totalTokens: 12 });
  });

  it('handles zero-valued usage without changing the total', () => {
    useUsageStore.getState().addUsage(P, {
      inputTokens: 5,
      outputTokens: 1,
      totalTokens: 6,
    });
    useUsageStore.getState().addUsage(P, {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    expect(useUsageStore.getState().total(P).totalTokens).toBe(6);
  });
});

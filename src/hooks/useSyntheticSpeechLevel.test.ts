import { act, renderHook } from '@testing-library/react-native';

import { useSyntheticSpeechLevel } from './useSyntheticSpeechLevel';

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * There is no real amplitude to read for the AI's own voice — `expo-audio`'s
 * player exposes no playback metering, only the level a *recorder* measures,
 * which is why the waveform used to show the user's own (silent, since the
 * mic is closed during playback) mic level while the AI spoke. This
 * generates a plausible-looking "something is being said" motion instead —
 * it must never be mistaken for a real level reading, so nothing here reads
 * an actual sample.
 *
 * Real timers throughout, with a short custom interval: this hook's own
 * async `renderHook` wrapper doesn't play well with fake timers elsewhere in
 * this codebase, and the interval value itself isn't the thing under test.
 */
describe('useSyntheticSpeechLevel', () => {
  it('stays at 0 while inactive', async () => {
    const { result } = await renderHook(() => useSyntheticSpeechLevel(false, 5));
    expect(result.current).toBe(0);

    await act(() => tick(30));
    expect(result.current).toBe(0);
  });

  it('moves once active', async () => {
    const { result } = await renderHook(() => useSyntheticSpeechLevel(true, 5));

    await act(() => tick(30));

    expect(result.current).toBeGreaterThan(0);
  });

  it('never leaves the 0–1 range, across many ticks', async () => {
    const { result } = await renderHook(() => useSyntheticSpeechLevel(true, 5));

    for (let i = 0; i < 20; i++) {
      await act(() => tick(5));
      expect(result.current).toBeGreaterThanOrEqual(0);
      expect(result.current).toBeLessThanOrEqual(1);
    }
  });

  /** Going quiet the instant playback stops matters more than looking alive. */
  it('drops back to 0 immediately when deactivated', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useSyntheticSpeechLevel(active, 5),
      { initialProps: { active: true } },
    );

    await act(() => tick(30));
    expect(result.current).toBeGreaterThan(0);

    await act(async () => {
      rerender({ active: false });
    });
    expect(result.current).toBe(0);
  });

  it('stops its timer on unmount rather than leaking', async () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = await renderHook(() => useSyntheticSpeechLevel(true, 5));

    await act(async () => {
      unmount();
    });

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

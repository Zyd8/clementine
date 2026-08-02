import { renderHook, act } from '@testing-library/react-native';
import { Keyboard, Platform, type View } from 'react-native';

import { useKeyboardOverlap } from './useKeyboardOverlap';

type Listener = (event: { endCoordinates: { screenY: number } }) => void;

// jest-expo runs this suite once per platform, and the hook subscribes to the
// `will` events on iOS and the `did` events on Android.
const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/** Captures the listeners so tests can drive keyboard events directly. */
const wireKeyboard = () => {
  const listeners: Record<string, Listener> = {};
  const remove = jest.fn();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation(((event: string, handler: Listener) => {
      listeners[event] = handler;
      return { remove };
    }) as unknown as typeof Keyboard.addListener);
  return { listeners, remove };
};

/** A view whose bottom edge sits at `y + height` in window coordinates. */
const viewAt = (y: number, height: number) => ({
  current: {
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
      cb(0, y, 390, height),
  } as unknown as View,
});

describe('useKeyboardOverlap', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports nothing while the keyboard is closed', async () => {
    wireKeyboard();
    const ref = viewAt(700, 60);
    const { result } = await renderHook(() => useKeyboardOverlap(ref));
    expect(result.current).toBe(0);
  });

  it('reports how far the keyboard covers the view', async () => {
    const { listeners } = wireKeyboard();
    // Composer occupies 700–760; keyboard starts at 500 → 260 covered.
    const ref = viewAt(700, 60);
    const { result } = await renderHook(() => useKeyboardOverlap(ref));

    await act(async () => {
      listeners[SHOW]?.({ endCoordinates: { screenY: 500 } });
    });
    expect(result.current).toBe(260);
  });

  /**
   * The self-correcting case: if the window already resized or panned, the
   * measurement reflects it and no extra padding is added. Without this the
   * composer would be lifted twice.
   */
  it('reports nothing when the view already sits above the keyboard', async () => {
    const { listeners } = wireKeyboard();
    const ref = viewAt(400, 60);
    const { result } = await renderHook(() => useKeyboardOverlap(ref));

    await act(async () => {
      listeners[SHOW]?.({ endCoordinates: { screenY: 500 } });
    });
    expect(result.current).toBe(0);
  });

  it('clears the overlap when the keyboard closes', async () => {
    const { listeners } = wireKeyboard();
    const ref = viewAt(700, 60);
    const { result } = await renderHook(() => useKeyboardOverlap(ref));

    await act(async () => {
      listeners[SHOW]?.({ endCoordinates: { screenY: 500 } });
    });
    expect(result.current).toBe(260);

    await act(async () => {
      listeners[HIDE]?.({ endCoordinates: { screenY: 0 } });
    });
    expect(result.current).toBe(0);
  });

  it('does nothing when the ref is not attached yet', async () => {
    const { listeners } = wireKeyboard();
    const ref = { current: null };
    const { result } = await renderHook(() => useKeyboardOverlap(ref));

    await act(async () => {
      listeners[SHOW]?.({ endCoordinates: { screenY: 500 } });
    });
    expect(result.current).toBe(0);
  });

  it('unsubscribes on unmount', async () => {
    const { remove } = wireKeyboard();
    const ref = viewAt(700, 60);
    const { unmount } = await renderHook(() => useKeyboardOverlap(ref));
    await act(async () => {
      unmount();
    });
    // One listener each for show and hide.
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

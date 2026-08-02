import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Anything that can report its window position — View, ScrollView, FlatList.
 * Typed structurally so callers are not forced to pick one.
 */
type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

/**
 * How many points of `ref` the on-screen keyboard is covering.
 *
 * `KeyboardAvoidingView` is not enough here. Its Android behavior is
 * `undefined` in every example because the platform was supposed to handle it
 * via `adjustResize` — but SDK 54+ draws edge-to-edge, where the window no
 * longer resizes for the keyboard, so nothing moved and the composer stayed
 * under it.
 *
 * This measures instead of assuming. On each keyboard event it takes the
 * view's real position in the window and subtracts the keyboard's top edge,
 * which makes it correct in both regimes: if something *did* resize or pan the
 * window, the measurement already reflects that and the overlap comes out
 * zero, so nothing is double-counted.
 *
 * Measuring only on keyboard events is deliberate. Applying the returned
 * padding moves the view clear, and re-measuring then would read an overlap of
 * zero and drop the padding, which would oscillate.
 */
/**
 * What the last keyboard event actually reported, for on-device diagnosis.
 * Exposed because the failure modes here are indistinguishable from the
 * outside: "no event fired", "event fired with no height", and "window already
 * resized so there is nothing to do" all look identical — an uncovered box
 * that stays covered.
 */
export type KeyboardProbe = {
  events: number;
  keyboardTop: number | null;
  keyboardHeight: number | null;
  viewBottom: number | null;
  overlap: number;
};

/**
 * Safety margin added to the measured overlap.
 *
 * The keyboard's `screenY` and the view's `measureInWindow` position can be
 * off by a few points (gesture bar, status-bar inset, rounding), which shows
 * up as the composer's top few pixels peeking above the keyboard. A small
 * constant clearance guarantees the input sits fully clear without the
 * over-lift that a large buffer would cause.
 */
export const KEYBOARD_CLEARANCE = 67;

export function useKeyboardOverlap(
  ref: RefObject<Measurable | null>,
  onProbe?: (probe: KeyboardProbe) => void,
): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    // iOS emits `will` events early enough to animate with the keyboard;
    // Android only reports a usable height on `did`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    let events = 0;

    const show = Keyboard.addListener(showEvent, (event) => {
      events += 1;
      const keyboardTop = event.endCoordinates.screenY;
      const keyboardHeight = event.endCoordinates.height;
      const node = ref.current;
      if (!node) {
        onProbe?.({
          events,
          keyboardTop,
          keyboardHeight,
          viewBottom: null,
          overlap: 0,
        });
        return;
      }
      node.measureInWindow((_x, y, _width, height) => {
        const viewBottom = y + height;
        const covered = Math.max(0, viewBottom - keyboardTop);
        // Clearance only when the keyboard actually covers something — never
        // push the input up when the keyboard is closed or already clear.
        setOverlap(covered > 0 ? covered + KEYBOARD_CLEARANCE : 0);
        onProbe?.({ events, keyboardTop, keyboardHeight, viewBottom, overlap: covered });
      });
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      events += 1;
      setOverlap(0);
      onProbe?.({
        events,
        keyboardTop: null,
        keyboardHeight: null,
        viewBottom: null,
        overlap: 0,
      });
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref, onProbe]);

  return overlap;
}

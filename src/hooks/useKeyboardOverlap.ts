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
export function useKeyboardOverlap(ref: RefObject<Measurable | null>): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    // iOS emits `will` events early enough to animate with the keyboard;
    // Android only reports a usable height on `did`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      const node = ref.current;
      if (!node) return;
      node.measureInWindow((_x, y, _width, height) => {
        setOverlap(Math.max(0, y + height - keyboardTop));
      });
    });

    const hide = Keyboard.addListener(hideEvent, () => setOverlap(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);

  return overlap;
}

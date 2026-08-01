import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

/**
 * The single entry point every themed component calls.
 *
 * Resolution order: an explicit 'light'/'dark' preference wins outright;
 * 'system' defers to the OS. `useColorScheme()` already re-renders on system
 * appearance change, so live OS switching needs no extra wiring.
 *
 * When the OS reports no scheme at all, dark wins — Gold Focus is a dark-first
 * design and the light palette is the derived one.
 */
export function useTheme(): Theme {
  const preference = useSettingsStore((state) => state.theme);
  const systemScheme = useColorScheme();

  if (preference === 'light') return lightTheme;
  if (preference === 'dark') return darkTheme;
  return systemScheme === 'light' ? lightTheme : darkTheme;
}

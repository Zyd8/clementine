import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { useTheme } from './useTheme';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockedUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

const setSystemScheme = (scheme: 'light' | 'dark' | null) =>
  mockedUseColorScheme.mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

const resolved = async () => (await renderHook(() => useTheme())).result.current;

describe('useTheme', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'system', hydrated: true });
  });

  it('follows the system when the preference is "system" (light)', async () => {
    setSystemScheme('light');
    await expect(resolved()).resolves.toBe(lightTheme);
  });

  it('follows the system when the preference is "system" (dark)', async () => {
    setSystemScheme('dark');
    await expect(resolved()).resolves.toBe(darkTheme);
  });

  it('falls back to dark when the system reports no scheme', async () => {
    setSystemScheme(null);
    await expect(resolved()).resolves.toBe(darkTheme);
  });

  it('lets a manual light override win over a dark system', async () => {
    setSystemScheme('dark');
    useSettingsStore.setState({ theme: 'light' });
    await expect(resolved()).resolves.toBe(lightTheme);
  });

  it('lets a manual dark override win over a light system', async () => {
    setSystemScheme('light');
    useSettingsStore.setState({ theme: 'dark' });
    await expect(resolved()).resolves.toBe(darkTheme);
  });

  it('honours a manual override even when the system reports nothing', async () => {
    setSystemScheme(null);
    useSettingsStore.setState({ theme: 'light' });
    await expect(resolved()).resolves.toBe(lightTheme);
  });

  it('re-renders to the new theme when the system appearance flips', async () => {
    setSystemScheme('light');
    const { result, rerender } = await renderHook(() => useTheme());
    expect(result.current).toBe(lightTheme);

    setSystemScheme('dark');
    await rerender(undefined);
    expect(result.current).toBe(darkTheme);
  });
});

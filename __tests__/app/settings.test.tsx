import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import SettingsScreen from '../../app/(tabs)/settings';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('SettingsScreen', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark', hydrated: true }));

  /**
   * The chat header used to carry a one-label cycling toggle. The design
   * gives theme a three-up row here instead, so all three states are visible
   * at once rather than requiring two taps to discover.
   */
  it('offers all three theme preferences at once', async () => {
    await render(<SettingsScreen />);
    for (const option of ['system', 'light', 'dark']) {
      expect(screen.getByTestId(`theme-${option}`)).toBeTruthy();
    }
  });

  it('marks the current preference gold and the rest steel', async () => {
    await render(<SettingsScreen />);
    expect(flatten(screen.getByTestId('theme-dark').props.style).borderColor).toBe(
      darkTheme.colors.gold,
    );
    expect(flatten(screen.getByTestId('theme-light').props.style).borderColor).toBe(
      darkTheme.colors.steel,
    );
  });

  it('applies a preference when tapped', async () => {
    await render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('theme-light'));
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('tells screen readers which preference is selected', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByTestId('theme-dark').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('theme-system').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('routes to the voice providers and connection screens', async () => {
    const { router } = jest.requireMock('expo-router') as {
      router: { push: jest.Mock };
    };
    router.push.mockClear();

    await render(<SettingsScreen />);
    fireEvent.press(screen.getByText(/providers/));
    expect(router.push).toHaveBeenCalledWith('/voice-profile');

    fireEvent.press(screen.getByText(/reconfigure/));
    expect(router.push).toHaveBeenCalledWith('/setup');
  });
});

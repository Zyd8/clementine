import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';

import ProfilesScreen from '../../app/(tabs)/profiles';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

describe('ProfilesScreen', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Hermes Laptop',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  it('names the connected instance in the header', async () => {
    await render(<ProfilesScreen />);
    expect(screen.getByText(/Hermes Laptop/)).toBeTruthy();
  });

  it('shows the one profile the host actually runs, marked active', async () => {
    await render(<ProfilesScreen />);
    expect(screen.getByText('default')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  /**
   * Rather than rendering a switcher that switches to nothing: the backend
   * was verified single-profile on 2026-08-02 and Phase 3 is parked.
   */
  it('explains why there is only one profile', async () => {
    await render(<ProfilesScreen />);
    expect(screen.getByText(/single profile/)).toBeTruthy();
  });

  it('disconnects the instance on request', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    useConnectionStore.setState({ disconnect });

    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Disconnect hermes instance'));
    expect(disconnect).toHaveBeenCalled();
  });

  it('drops the disconnect action when nothing is connected', async () => {
    useConnectionStore.setState({ connection: null });
    await render(<ProfilesScreen />);
    expect(screen.queryByLabelText('Disconnect hermes instance')).toBeNull();
    expect(screen.getByText('no hermes connected')).toBeTruthy();
  });
});

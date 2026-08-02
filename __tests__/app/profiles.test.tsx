import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useConnectionStore } from '@/stores/connection';
import { useProfilesStore } from '@/stores/profiles';
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
    useProfilesStore.setState({
      profiles: [{ id: 'default', name: 'default', avatar: 'DF' }],
      activeId: 'default',
      hydrated: true,
    });
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

  it('shows the default profile, marked active', async () => {
    await render(<ProfilesScreen />);
    expect(screen.getByLabelText('Name for default').props.value).toBe('default');
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  /** The design's rows are editable in place — name and two-letter avatar. */
  it('renames a profile in place', async () => {
    await render(<ProfilesScreen />);
    fireEvent.changeText(screen.getByLabelText('Name for default'), 'personal');
    expect(useProfilesStore.getState().profiles[0]?.name).toBe('personal');
  });

  it('edits the avatar by picking an image, which is saved locally', async () => {
    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Change avatar for default'));
    await waitFor(() =>
      expect(useProfilesStore.getState().profiles[0]?.avatar).toMatch(
        /^file:\/\/\/documents\/avatars\/default\.jpg$/,
      ),
    );
  });

  it('shows the picked image avatar as an image, not initials', async () => {
    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Change avatar for default'));
    await waitFor(() =>
      expect(screen.getByLabelText('Profile avatar image')).toBeTruthy(),
    );
  });

  it('adds a profile and switches to it', async () => {
    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Add profile'));
    await waitFor(() => expect(useProfilesStore.getState().profiles).toHaveLength(2));

    const added = useProfilesStore.getState().profiles[1]!;
    fireEvent.press(screen.getByLabelText(`Switch to ${added.name}`));
    await waitFor(() =>
      expect(useProfilesStore.getState().activeId).toBe(added.id),
    );
  });

  /**
   * The server runs one profile — switching partitions local state only, and
   * the screen has to say so rather than implying a server-side switch.
   */
  it('explains that switching is local', async () => {
    await render(<ProfilesScreen />);
    expect(screen.getByText(/single profile server-side/)).toBeTruthy();
  });

  it('disconnects the instance only after confirming the dialog', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    useConnectionStore.setState({ disconnect });

    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Disconnect hermes instance'));

    // First tap must NOT disconnect — it opens the confirmation dialog.
    expect(disconnect).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText('Disconnect this Hermes instance?'),
      ).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('DISCONNECT'));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not disconnect when the confirmation dialog is cancelled', async () => {
    const disconnect = jest.fn().mockResolvedValue(undefined);
    useConnectionStore.setState({ disconnect });

    await render(<ProfilesScreen />);
    fireEvent.press(screen.getByLabelText('Disconnect hermes instance'));
    await waitFor(() => expect(screen.getByText('CANCEL')).toBeTruthy());
    fireEvent.press(screen.getByText('CANCEL'));
    expect(disconnect).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByText('Disconnect this Hermes instance?'),
      ).toBeNull(),
    );
  });

  it('drops the disconnect action when nothing is connected', async () => {
    useConnectionStore.setState({ connection: null });
    await render(<ProfilesScreen />);
    expect(screen.queryByLabelText('Disconnect hermes instance')).toBeNull();
    expect(screen.getByText('no hermes connected')).toBeTruthy();
  });
});

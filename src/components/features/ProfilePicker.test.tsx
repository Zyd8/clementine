import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { ProfilePicker } from './ProfilePicker';

const PROFILES = [
  { id: 'default', name: 'personal' },
  { id: 'p_work', name: 'work' },
];

const setup = (overrides: Partial<React.ComponentProps<typeof ProfilePicker>> = {}) =>
  render(
    <ProfilePicker
      visible
      onClose={jest.fn()}
      endpointName="my VPS"
      profiles={PROFILES}
      activeId="default"
      onSelectProfile={jest.fn()}
      {...overrides}
    />,
  );

describe('ProfilePicker', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('names the instance being switched within', async () => {
    await setup();
    expect(screen.getByText('SWITCH PROFILE — my VPS')).toBeTruthy();
  });

  it('lists every profile', async () => {
    await setup();
    expect(screen.getByText('personal')).toBeTruthy();
    expect(screen.getByText('work')).toBeTruthy();
  });

  it('marks only the active one', async () => {
    await setup();
    expect(screen.getAllByText('ACTIVE')).toHaveLength(1);
    expect(screen.getByTestId('picker-default').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('selects a profile and closes', async () => {
    const onSelectProfile = jest.fn();
    const onClose = jest.fn();
    await setup({ onSelectProfile, onClose });

    fireEvent.press(screen.getByTestId('picker-p_work'));
    expect(onSelectProfile).toHaveBeenCalledWith('p_work');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is tapped', async () => {
    const onClose = jest.fn();
    await setup({ onClose });
    fireEvent.press(screen.getByLabelText('Dismiss profile picker'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while hidden', async () => {
    await setup({ visible: false });
    expect(screen.queryByText('personal')).toBeNull();
  });
});

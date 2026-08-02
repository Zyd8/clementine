import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { ConfirmDialog } from './ConfirmDialog';

const setup = (overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) =>
  render(
    <ConfirmDialog
      visible
      title="Disconnect this Hermes instance?"
      message="This wipes the local connection, session and profile state on this device. The server is untouched."
      confirmLabel="DISCONNECT"
      cancelLabel="CANCEL"
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />,
  );

describe('ConfirmDialog', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('renders the title and message while visible', async () => {
    await setup();
    expect(screen.getByText('Disconnect this Hermes instance?')).toBeTruthy();
    expect(
      screen.getByText(
        'This wipes the local connection, session and profile state on this device. The server is untouched.',
      ),
    ).toBeTruthy();
  });

  it('shows both action labels', async () => {
    await setup();
    expect(screen.getByText('DISCONNECT')).toBeTruthy();
    expect(screen.getByText('CANCEL')).toBeTruthy();
  });

  it('calls onConfirm when the confirm action is pressed', async () => {
    const onConfirm = jest.fn();
    await setup({ onConfirm });
    fireEvent.press(screen.getByText('DISCONNECT'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('calls onCancel when the cancel action is pressed', async () => {
    const onCancel = jest.fn();
    await setup({ onCancel });
    fireEvent.press(screen.getByText('CANCEL'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the backdrop is tapped', async () => {
    const onCancel = jest.fn();
    await setup({ onCancel });
    fireEvent.press(screen.getByLabelText('Dismiss confirm dialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when the backdrop is tapped', async () => {
    const onConfirm = jest.fn();
    await setup({ onConfirm });
    fireEvent.press(screen.getByLabelText('Dismiss confirm dialog'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing while hidden', async () => {
    await setup({ visible: false });
    expect(screen.queryByText('Disconnect this Hermes instance?')).toBeNull();
  });
});

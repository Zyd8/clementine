import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { Stepper } from './Stepper';

const setup = (overrides: Partial<React.ComponentProps<typeof Stepper>> = {}) =>
  render(
    <Stepper
      label="END OF SPEECH"
      value={900}
      step={100}
      min={300}
      max={3000}
      onChange={jest.fn()}
      unit="ms"
      {...overrides}
    />,
  );

describe('Stepper', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('shows the value with its unit', async () => {
    await setup();
    expect(screen.getByText('900ms')).toBeTruthy();
  });

  it('steps up', async () => {
    const onChange = jest.fn();
    await setup({ onChange });
    fireEvent.press(screen.getByLabelText('Increase END OF SPEECH'));
    expect(onChange).toHaveBeenCalledWith(1000);
  });

  it('steps down', async () => {
    const onChange = jest.fn();
    await setup({ onChange });
    fireEvent.press(screen.getByLabelText('Decrease END OF SPEECH'));
    expect(onChange).toHaveBeenCalledWith(800);
  });

  /** A silence timeout of zero would end every turn instantly. */
  it('clamps at the minimum', async () => {
    const onChange = jest.fn();
    await setup({ value: 300, onChange });

    fireEvent.press(screen.getByLabelText('Decrease END OF SPEECH'));
    expect(onChange).toHaveBeenCalledWith(300);
  });

  it('clamps at the maximum', async () => {
    const onChange = jest.fn();
    await setup({ value: 3000, onChange });

    fireEvent.press(screen.getByLabelText('Increase END OF SPEECH'));
    expect(onChange).toHaveBeenCalledWith(3000);
  });

  it('reads the value out to assistive tech, not just the buttons', async () => {
    await setup();
    expect(screen.getByLabelText('END OF SPEECH is 900ms')).toBeTruthy();
  });
});

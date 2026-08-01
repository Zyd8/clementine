import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';

import { Button } from './Button';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="VALIDATE & CONNECT" onPress={jest.fn()} />);
    expect(screen.getByText('VALIDATE & CONNECT')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="CONNECT" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is gold when idle — gold means "this is the live action"', async () => {
    await render(<Button label="CONNECT" onPress={jest.fn()} />);
    expect(flatten(screen.getByRole('button').props.style).backgroundColor).toBe(
      darkTheme.colors.gold,
    );
  });

  it('dims to gold-dim while busy', async () => {
    await render(<Button label="CONNECT" onPress={jest.fn()} busy />);
    expect(flatten(screen.getByRole('button').props.style).backgroundColor).toBe(
      darkTheme.colors.goldDim,
    );
  });

  it('shows the busy label instead of the idle one', async () => {
    await render(
      <Button label="CONNECT" busyLabel="VALIDATING…" onPress={jest.fn()} busy />,
    );
    expect(screen.getByText('VALIDATING…')).toBeTruthy();
    expect(screen.queryByText('CONNECT')).toBeNull();
  });

  it('does not fire while busy — no double submit', async () => {
    const onPress = jest.fn();
    await render(<Button label="CONNECT" onPress={onPress} busy />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="CONNECT" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes its busy state to assistive tech, not just visually', async () => {
    await render(<Button label="CONNECT" onPress={jest.fn()} busy />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });
});

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { Avatar } from './Avatar';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Avatar', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('shows the initials it is given', async () => {
    await render(<Avatar initials="PR" />);
    expect(screen.getByText('PR')).toBeTruthy();
  });

  it('rings the active profile in gold', async () => {
    await render(<Avatar initials="PR" testID="a" />);
    expect(flatten(screen.getByTestId('a').props.style).borderColor).toBe(
      darkTheme.colors.gold,
    );
  });

  it('rings an inactive profile in steel', async () => {
    await render(<Avatar initials="WK" active={false} testID="a" />);
    expect(flatten(screen.getByTestId('a').props.style).borderColor).toBe(
      darkTheme.colors.steel,
    );
  });

  /** Only the mic is a filled circle — an avatar indicates, it does not invite a tap. */
  it('stays an outline, never a gold disc', async () => {
    await render(<Avatar initials="PR" testID="a" />);
    expect(flatten(screen.getByTestId('a').props.style).backgroundColor).toBe(
      darkTheme.colors.canvas,
    );
  });

  it('scales the circle and its text together', async () => {
    await render(<Avatar initials="PR" size={34} testID="a" />);
    const style = flatten(screen.getByTestId('a').props.style);
    expect(style.width).toBe(34);
    expect(style.height).toBe(34);
    expect(flatten(screen.getByText('PR').props.style).fontSize).toBeCloseTo(34 * 0.38);
  });
});

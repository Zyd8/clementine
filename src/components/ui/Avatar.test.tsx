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

  /** An uploaded avatar is a locally saved image, not initials. */
  it('renders an image when given a file URI', async () => {
    await render(<Avatar initials="file:///documents/avatars/default.jpg" size={34} testID="a" />);
    const image = screen.getByLabelText('Profile avatar image');
    expect(image.props.source).toEqual({
      uri: 'file:///documents/avatars/default.jpg',
    });
    // No initials text for an image avatar.
    expect(screen.queryByText('fi')).toBeNull();
  });

  /**
   * A child sized to match the OUTER box (border included) overflows the
   * ring's inner content area slightly on every edge — read as the image
   * sitting off-center. Filling the parent's box, not copying its pixel
   * size, is what actually centers it regardless of border width.
   */
  it('fills its circle rather than copying the outer pixel size', async () => {
    await render(
      <Avatar initials="file:///documents/avatars/default.jpg" size={34} testID="a" />,
    );
    const image = screen.getByLabelText('Profile avatar image');
    const style = flatten(image.props.style);
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
  });

  it('keeps the gold ring for an image avatar too', async () => {
    await render(
      <Avatar initials="file:///documents/avatars/default.jpg" testID="a" />,
    );
    expect(flatten(screen.getByTestId('a').props.style).borderColor).toBe(
      darkTheme.colors.gold,
    );
  });
});

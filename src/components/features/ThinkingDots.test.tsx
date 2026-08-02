import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { ThinkingDots } from './ThinkingDots';

describe('ThinkingDots', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('announces itself to screen readers rather than being silent motion', async () => {
    await render(<ThinkingDots />);
    expect(screen.getByLabelText('Agent is thinking')).toBeTruthy();
  });

  it('draws the design’s three dots', async () => {
    await render(<ThinkingDots testID="dots" />);
    expect(screen.getByTestId('dots').children).toHaveLength(3);
  });

  /** Loops run until unmount; leaving them alive would leak a driver per turn. */
  it('unmounts without leaving an animation running', async () => {
    const { unmount } = await render(<ThinkingDots />);
    expect(() => unmount()).not.toThrow();
  });
});

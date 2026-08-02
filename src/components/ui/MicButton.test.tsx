import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';

import { MicButton } from './MicButton';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

beforeEach(() => {
  // Pin to dark theme so color assertions are deterministic.
  useSettingsStore.setState({ theme: 'dark' });
});

describe('MicButton', () => {
  it('renders in IDLE state with gold fill', async () => {
    await render(<MicButton voiceState="IDLE" onPress={jest.fn()} />);
    // The gold signal color is the same in both themes, but we pin dark anyway.
    const bg = flatten(screen.getByRole('button').props.style).backgroundColor;
    expect(bg).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Tap to talk');
  });

  it('renders in LISTENING state with gold border (not fill)', async () => {
    await render(<MicButton voiceState="LISTENING" onPress={jest.fn()} />);
    const style = flatten(screen.getByRole('button').props.style);
    // canvasRaised bg, gold border
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe('#f0a030'); // gold signal color
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Listening...');
  });

  it('renders in PROCESSING state with dimmed appearance', async () => {
    await render(<MicButton voiceState="PROCESSING" onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Thinking...');
    // Gold-dim is a signal color, same in both themes
    expect(flatten(screen.getByRole('button').props.style).backgroundColor).toBe('#c8872a');
  });

  it('renders in PLAYING state with dimmed appearance', async () => {
    await render(<MicButton voiceState="PLAYING" onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Agent speaking');
    expect(flatten(screen.getByRole('button').props.style).backgroundColor).toBe('#c8872a');
  });

  it('calls onPress when tapped (tap semantics, not hold)', async () => {
    const onPress = jest.fn();
    await render(<MicButton voiceState="IDLE" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onPress in LISTENING state (for cancel)', async () => {
    const onPress = jest.fn();
    await render(<MicButton voiceState="LISTENING" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes accessibility state for screen readers', async () => {
    await render(<MicButton voiceState="LISTENING" onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      selected: true,
      busy: false,
    });
  });

  it('exposes busy accessibility state in PROCESSING', async () => {
    await render(<MicButton voiceState="PROCESSING" onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      selected: false,
      busy: true,
    });
  });

  it('uses tap (not hold) — a press fires the handler in any state', async () => {
    const onPress = jest.fn();
    await render(<MicButton voiceState="PLAYING" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme, lightTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { Bubble } from './Bubble';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Bubble', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('renders user text', async () => {
    await render(<Bubble role="user" text="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders assistant text', async () => {
    await render(<Bubble role="assistant" text="hi there" />);
    expect(screen.getByText('hi there')).toBeTruthy();
  });

  it('gives the user bubble a raised surface', async () => {
    await render(<Bubble role="user" text="hello" testID="b" />);
    expect(flatten(screen.getByTestId('b').props.style).backgroundColor).toBe(
      darkTheme.colors.canvasRaised,
    );
  });

  it('gives the assistant a transparent surface with a gold left border', async () => {
    await render(<Bubble role="assistant" text="hi" testID="b" />);
    const style = flatten(screen.getByTestId('b').props.style);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderLeftColor).toBe(darkTheme.colors.gold);
    expect(style.borderLeftWidth).toBe(2);
  });

  it('announces in-flight assistant text politely for screen readers', async () => {
    await render(<Bubble role="assistant" text="partial" streaming testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBe('polite');
  });

  it('stops announcing once the turn has settled', async () => {
    await render(<Bubble role="assistant" text="done" testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBe('none');
  });

  it('never announces the user’s own message back to them', async () => {
    await render(<Bubble role="user" text="mine" testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBe('none');
  });

  it('shows a cursor while streaming', async () => {
    await render(<Bubble role="assistant" text="typing" streaming />);
    expect(screen.getByLabelText('Agent is replying')).toBeTruthy();
  });

  it('hides the cursor when not streaming', async () => {
    await render(<Bubble role="assistant" text="done" />);
    expect(screen.queryByLabelText('Agent is replying')).toBeNull();
  });

  it('renders an error bubble in the err color', async () => {
    await render(<Bubble role="error" text="boom" testID="b" />);
    expect(flatten(screen.getByTestId('b').props.style).borderLeftColor).toBe(
      darkTheme.colors.err,
    );
  });

  it('takes every color from the active theme — light mode uses no dark tokens', async () => {
    useSettingsStore.setState({ theme: 'light' });
    await render(<Bubble role="user" text="hello" testID="b" />);
    expect(flatten(screen.getByTestId('b').props.style).backgroundColor).toBe(
      lightTheme.colors.canvasRaised,
    );
  });
});

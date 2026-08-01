import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme, lightTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { ToolCallCard } from './ToolCallCard';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const border = (testID: string) =>
  flatten(screen.getByTestId(testID).props.style).borderLeftColor;

describe('ToolCallCard', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('shows the tool name', async () => {
    await render(<ToolCallCard tool="terminal" args="echo hi" status="running" />);
    expect(screen.getByText(/TERMINAL/i)).toBeTruthy();
  });

  it('shows the command being run', async () => {
    await render(<ToolCallCard tool="terminal" args="echo hi" status="running" />);
    expect(screen.getByText('echo hi')).toBeTruthy();
  });

  it('wears steel while running — idle-coloured until it resolves', async () => {
    await render(
      <ToolCallCard tool="terminal" args="x" status="running" testID="card" />,
    );
    expect(border('card')).toBe(darkTheme.colors.steel);
  });

  it('turns ok-green on success', async () => {
    await render(<ToolCallCard tool="terminal" args="x" status="ok" testID="card" />);
    expect(border('card')).toBe(darkTheme.colors.ok);
  });

  it('turns err-red on failure', async () => {
    await render(<ToolCallCard tool="terminal" args="x" status="error" testID="card" />);
    expect(border('card')).toBe(darkTheme.colors.err);
  });

  it('shows the duration once known', async () => {
    await render(
      <ToolCallCard tool="terminal" args="x" status="ok" durationMs={102} />,
    );
    expect(screen.getByText(/102\s*ms/i)).toBeTruthy();
  });

  it('omits duration while still running', async () => {
    await render(<ToolCallCard tool="terminal" args="x" status="running" />);
    expect(screen.queryByText(/ms/i)).toBeNull();
  });

  describe('accessibility — state must be audible, not just colored', () => {
    it('announces the running state in its label', async () => {
      await render(
        <ToolCallCard tool="terminal" args="echo hi" status="running" testID="card" />,
      );
      expect(screen.getByTestId('card').props.accessibilityLabel).toMatch(
        /terminal.*echo hi.*running/i,
      );
    });

    it('announces completion, not just a color flip', async () => {
      await render(
        <ToolCallCard tool="terminal" args="echo hi" status="ok" testID="card" />,
      );
      expect(screen.getByTestId('card').props.accessibilityLabel).toMatch(
        /terminal.*completed/i,
      );
    });

    it('announces failure distinctly from success', async () => {
      await render(
        <ToolCallCard tool="terminal" args="echo hi" status="error" testID="card" />,
      );
      expect(screen.getByTestId('card').props.accessibilityLabel).toMatch(/failed/i);
    });

    it('announces the state transition when status changes', async () => {
      const view = await render(
        <ToolCallCard tool="terminal" args="x" status="running" testID="card" />,
      );
      expect(screen.getByTestId('card').props.accessibilityLabel).toMatch(/running/i);

      await view.rerender(
        <ToolCallCard tool="terminal" args="x" status="ok" testID="card" />,
      );
      expect(screen.getByTestId('card').props.accessibilityLabel).toMatch(/completed/i);
    });
  });

  describe('collapsing', () => {
    it('truncates a long command to one line by default', async () => {
      const long = 'echo '.repeat(60);
      await render(<ToolCallCard tool="terminal" args={long} status="ok" />);
      expect(screen.getByText(long).props.numberOfLines).toBe(1);
    });

    it('expands on tap', async () => {
      const long = 'echo '.repeat(60);
      await render(
        <ToolCallCard tool="terminal" args={long} status="ok" testID="card" />,
      );
      await fireEvent.press(screen.getByTestId('card'));
      expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
    });

    it('exposes its expanded state to assistive tech', async () => {
      await render(<ToolCallCard tool="terminal" args="x" status="ok" testID="card" />);
      expect(screen.getByTestId('card').props.accessibilityState).toMatchObject({
        expanded: false,
      });
      await fireEvent.press(screen.getByTestId('card'));
      expect(screen.getByTestId('card').props.accessibilityState).toMatchObject({
        expanded: true,
      });
    });
  });

  it('reads all colors from the active theme in light mode too', async () => {
    useSettingsStore.setState({ theme: 'light' });
    await render(
      <ToolCallCard tool="terminal" args="x" status="running" testID="card" />,
    );
    expect(border('card')).toBe(lightTheme.colors.steel);
  });
});

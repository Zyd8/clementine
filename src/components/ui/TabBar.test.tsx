import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { TabBar, TABS } from './TabBar';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('TabBar', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('renders the four tabs from the design, in order', async () => {
    await render(<TabBar activeKey="index" onSelect={jest.fn()} />);
    expect(TABS.map((t) => t.label)).toEqual([
      'CHAT',
      'SESSIONS',
      'PROFILES',
      'SETTINGS',
    ]);
    for (const tab of TABS) expect(screen.getByText(tab.label)).toBeTruthy();
  });

  /** Typographic glyphs, per DESIGN.md's "no icons" rule. */
  it('labels each tab with its glyph', async () => {
    await render(<TabBar activeKey="index" onSelect={jest.fn()} />);
    for (const glyph of ['>_', '≡', '◆', '⚙']) {
      expect(screen.getByText(glyph)).toBeTruthy();
    }
  });

  it('marks the active tab gold and leaves the rest muted', async () => {
    await render(<TabBar activeKey="sessions" onSelect={jest.fn()} />);
    expect(flatten(screen.getByText('SESSIONS').props.style).color).toBe(
      darkTheme.colors.gold,
    );
    expect(flatten(screen.getByText('CHAT').props.style).color).toBe(
      darkTheme.colors.inkMuted,
    );
  });

  /** The gold top border is the focus language — only the live tab wears it. */
  it('gives only the active tab a 2px gold top border', async () => {
    await render(<TabBar activeKey="settings" onSelect={jest.fn()} />);
    const active = flatten(screen.getByTestId('tab-settings').props.style);
    expect(active.borderTopWidth).toBe(2);
    expect(active.borderTopColor).toBe(darkTheme.colors.gold);

    const idle = flatten(screen.getByTestId('tab-index').props.style);
    expect(idle.borderTopWidth).toBe(2);
    expect(idle.borderTopColor).toBe('transparent');
  });

  it('reports the tapped tab', async () => {
    const onSelect = jest.fn();
    await render(<TabBar activeKey="index" onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('tab-profiles'));
    expect(onSelect).toHaveBeenCalledWith('profiles');
  });

  it('tells screen readers which tab is selected', async () => {
    await render(<TabBar activeKey="index" onSelect={jest.fn()} />);
    expect(screen.getByTestId('tab-index').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('tab-sessions').props.accessibilityState.selected).toBe(
      false,
    );
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

import { TabBar, TABS } from './TabBar';

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

/** A handset with a gesture bar: 48pt of status bar, 24pt of system nav. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 48, left: 0, right: 0, bottom: 24 },
};

const renderBar = (props: React.ComponentProps<typeof TabBar>) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TabBar {...props} />
    </SafeAreaProvider>,
  );

describe('TabBar', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'dark' }));

  it('renders the four tabs from the design, in order', async () => {
    await renderBar({ activeKey: 'index', onSelect: jest.fn() });
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
    await renderBar({ activeKey: 'index', onSelect: jest.fn() });
    for (const glyph of ['>_', '≡', '◆', '⚙']) {
      expect(screen.getByText(glyph)).toBeTruthy();
    }
  });

  it('marks the active tab gold and leaves the rest muted', async () => {
    await renderBar({ activeKey: 'sessions', onSelect: jest.fn() });
    expect(flatten(screen.getByText('SESSIONS').props.style).color).toBe(
      darkTheme.colors.gold,
    );
    expect(flatten(screen.getByText('CHAT').props.style).color).toBe(
      darkTheme.colors.inkMuted,
    );
  });

  /** The gold top border is the focus language — only the live tab wears it. */
  it('gives only the active tab a 2px gold top border', async () => {
    await renderBar({ activeKey: 'settings', onSelect: jest.fn() });
    const active = flatten(screen.getByTestId('tab-settings').props.style);
    expect(active.borderTopWidth).toBe(2);
    expect(active.borderTopColor).toBe(darkTheme.colors.gold);

    const idle = flatten(screen.getByTestId('tab-index').props.style);
    expect(idle.borderTopWidth).toBe(2);
    expect(idle.borderTopColor).toBe('transparent');
  });

  it('reports the tapped tab', async () => {
    const onSelect = jest.fn();
    await renderBar({ activeKey: 'index', onSelect: onSelect });
    fireEvent.press(screen.getByTestId('tab-profiles'));
    expect(onSelect).toHaveBeenCalledWith('profiles');
  });

  /** The bar is the bottom-most chrome, so it must clear the gesture bar. */
  it('pads itself clear of the system navigation bar', async () => {
    await renderBar({ activeKey: 'index', onSelect: jest.fn() });
    const bar = screen.getByTestId('tab-index').parent;
    expect(flatten(bar?.props.style).paddingBottom).toBe(METRICS.insets.bottom);
  });

  it('tells screen readers which tab is selected', async () => {
    await renderBar({ activeKey: 'index', onSelect: jest.fn() });
    expect(screen.getByTestId('tab-index').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('tab-sessions').props.accessibilityState.selected).toBe(
      false,
    );
  });
});

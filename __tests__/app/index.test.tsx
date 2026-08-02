import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { darkTheme } from '@/constants/theme';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';

import ChatScreen from '../../app/(tabs)/index';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

// The lift value itself is covered by useKeyboardOverlap's own tests; here we
// only care that the composer actually consumes it.
jest.mock('@/hooks/useKeyboardOverlap', () => ({
  useKeyboardOverlap: () => 268,
}));

jest.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    send: jest.fn(),
    stop: jest.fn(),
    isStreaming: false,
  }),
}));

const STABLE_FEED: never[] = [];
let mockUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

jest.mock('@/stores/chat', () => {
  const zustand = jest.requireActual('zustand');
  return {
    useChatStore: zustand.create(() => ({
      feed: () => STABLE_FEED,
      activeRun: () => null,
      reset: () => {},
      appendUserMessage: () => {},
      applyEvent: () => {},
      byProfile: {},
    })),
    profileKey: () => '\u0000default',
  };
});

jest.mock('@/stores/usage', () => {
  const zustand = jest.requireActual('zustand');
  return {
    useUsageStore: zustand.create(() => ({
      total: () => mockUsage,
      addUsage: () => {},
      reset: () => {},
      byProfile: {},
    })),
  };
});

describe('ChatScreen — header', () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  beforeEach(() => {
    mockUsage = { inputTokens: 40_000, outputTokens: 26_809, totalTokens: 66_809 };
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Hermes Laptop',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  it('shows the endpoint name in full rather than clipping it to fit the nav', async () => {
    await render(<ChatScreen />);
    expect(screen.getByText('Hermes Laptop')).toBeTruthy();
  });

  /** DESIGN.md: usage badge is a pill — raised bg, steel border, muted text. */
  it('renders the token count as a pill badge, per the design tokens', async () => {
    await render(<ChatScreen />);
    const badge = screen.getByTestId('usage-badge');
    const style = flatten(badge.props.style);
    expect(style.backgroundColor).toBe(darkTheme.colors.canvasRaised);
    expect(style.borderColor).toBe(darkTheme.colors.steel);
    // The design abbreviates and says what the number means.
    expect(screen.getByText('66.8K tok used today')).toBeTruthy();
  });

  it('shows the active profile as a chip that opens the switcher', async () => {
    await render(<ChatScreen />);
    expect(screen.getByLabelText('Switch profile')).toBeTruthy();
    expect(screen.getByText('default')).toBeTruthy();
  });

  /**
   * Phase 10's audit flagged this: the label looked like a readout but
   * navigated to setup. It is now purely a readout — reconfiguring lives on
   * the settings tab.
   */
  it('keeps the token readout inert', async () => {
    const { router } = jest.requireMock('expo-router') as {
      router: { push: jest.Mock };
    };
    router.push.mockClear();

    await render(<ChatScreen />);
    fireEvent.press(screen.getByTestId('usage-badge'));
    expect(router.push).not.toHaveBeenCalled();
  });

  /** The tab bar owns navigation now — the header must not duplicate it. */
  it('no longer carries its own nav row', async () => {
    await render(<ChatScreen />);
    for (const label of ['SESSIONS', 'VOICE', 'SETUP']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });
});

describe('ChatScreen — composer', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Hermes Laptop',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  /**
   * The handoff spec's composer is "text input + send button + round mic
   * button". Phase 7 built and tested MicButton but never mounted it, so
   * tap-to-talk was unreachable from the app.
   */
  it('mounts the mic button beside the send button', async () => {
    await render(<ChatScreen />);
    expect(screen.getByLabelText('Tap to talk')).toBeTruthy();
  });

  const flatten = (style: unknown): Record<string, unknown> =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  it('lifts the composer by however much the keyboard covers it', async () => {
    await render(<ChatScreen />);
    const composer = screen.getByLabelText('Message').parent;
    expect(flatten(composer?.props.style).marginBottom).toBe(268);
  });

  /**
   * The lift comes out of the list's height. A list that grows but cannot
   * shrink overflows the column instead, pushing the composer further under
   * the keyboard — which is exactly what happened on device.
   */
  it('lets the feed shrink so the lift has somewhere to come from', async () => {
    await render(<ChatScreen />);
    // The FlatList renders as a scroll view; find it by its testID-free role.
    const list = screen.getByTestId('chat-feed');
    expect(flatten(list.props.style).flex).toBe(1);
  });
});

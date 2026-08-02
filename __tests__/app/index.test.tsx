import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react-native';

import { darkTheme } from '@/constants/theme';
import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';

import ChatScreen from '../../app/index';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
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

describe('ChatScreen — theme toggle', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'system', hydrated: true });
    useConnectionStore.setState({
      connection: {
        name: 'Test Hermes',
        baseUrl: 'http://100.106.162.39:8642',
        apiKey: 'test-key',
        connectedAt: 1,
      },
      hydrated: true,
    });
  });

  it('renders a theme toggle that cycles system → light → dark', async () => {
    const { rerender } = await render(<ChatScreen />);

    // Initial label: SYSTEM
    expect(screen.getByLabelText('Toggle theme')).toBeTruthy();
    expect(screen.getByText('SYSTEM')).toBeTruthy();

    // Switch to light
    await act(async () => {
      await useSettingsStore.getState().setTheme('light');
    });
    await rerender(<ChatScreen />);
    expect(screen.getByText('LIGHT')).toBeTruthy();

    // Switch to dark
    await act(async () => {
      await useSettingsStore.getState().setTheme('dark');
    });
    await rerender(<ChatScreen />);
    expect(screen.getByText('DARK')).toBeTruthy();

    // Back to system
    await act(async () => {
      await useSettingsStore.getState().setTheme('system');
    });
    await rerender(<ChatScreen />);
    expect(screen.getByText('SYSTEM')).toBeTruthy();
  });
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
    expect(screen.getByText('66809 tok')).toBeTruthy();
  });

  /**
   * Phase 10's audit flagged this: the label looked like a readout but
   * navigated to setup. The readout is now inert and SETUP is its own link.
   */
  it('keeps the token readout inert and gives SETUP its own control', async () => {
    const { router } = jest.requireMock('expo-router') as {
      router: { push: jest.Mock };
    };
    router.push.mockClear();

    await render(<ChatScreen />);
    fireEvent.press(screen.getByTestId('usage-badge'));
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('SETUP'));
    expect(router.push).toHaveBeenCalledWith('/setup');
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
});

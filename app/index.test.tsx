import React from 'react';
import { render, screen, act } from '@testing-library/react-native';

import { useConnectionStore } from '@/stores/connection';
import { useSettingsStore } from '@/stores/settings';

import ChatScreen from './index';

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
const STABLE_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

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
      total: () => STABLE_USAGE,
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
    rerender(<ChatScreen />);
    expect(screen.getByText('LIGHT')).toBeTruthy();

    // Switch to dark
    await act(async () => {
      await useSettingsStore.getState().setTheme('dark');
    });
    rerender(<ChatScreen />);
    expect(screen.getByText('DARK')).toBeTruthy();

    // Back to system
    await act(async () => {
      await useSettingsStore.getState().setTheme('system');
    });
    rerender(<ChatScreen />);
    expect(screen.getByText('SYSTEM')).toBeTruthy();
  });
});

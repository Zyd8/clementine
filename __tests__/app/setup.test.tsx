import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';

import SetupScreen from '../../app/setup';

/** Without initialMetrics the provider renders nothing until it measures. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 48, left: 0, right: 0, bottom: 24 },
};

// Mock useColorScheme so useTheme works without the native module
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('@/hooks/useConnectionSetup', () => ({
  useConnectionSetup: () => ({
    status: 'idle' as const,
    error: null,
    submit: jest.fn(),
  }),
}));

describe('SetupScreen', () => {
  it('onboarding hint points at the canonical CLEMENTINE_API_KEY var', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><SetupScreen /></SafeAreaProvider>);
    const hintText = screen.getByText(/grep CLEMENTINE_API_KEY/);
    expect(hintText).toBeTruthy();
  });
});

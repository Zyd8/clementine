import React from 'react';
import { render, screen } from '@testing-library/react-native';

import SetupScreen from './setup';

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
  it('onboarding hint mentions API_SERVER_KEY, not CLEMENTINE_API_KEY', async () => {
    await render(<SetupScreen />);
    const hintText = screen.getByText(/grep API_SERVER_KEY/);
    expect(hintText).toBeTruthy();
    // Ensure the old wrong var is NOT present
    expect(screen.queryByText(/CLEMENTINE_API_KEY/)).toBeNull();
  });
});

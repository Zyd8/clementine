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
  it('onboarding hint mentions CLEMENTINE_API_KEY (the canonical var)', async () => {
    await render(<SetupScreen />);
    const hintText = screen.getByText(/grep CLEMENTINE_API_KEY/);
    expect(hintText).toBeTruthy();
    // The generic legacy name is gone from the copy
    expect(screen.queryByText(/API_SERVER_KEY/)).toBeNull();
  });
});

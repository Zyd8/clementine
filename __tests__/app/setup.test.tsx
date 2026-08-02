import React from 'react';
import { render, screen } from '@testing-library/react-native';

import SetupScreen from '../../app/setup';

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
    await render(<SetupScreen />);
    const hintText = screen.getByText(/grep CLEMENTINE_API_KEY/);
    expect(hintText).toBeTruthy();
  });
});

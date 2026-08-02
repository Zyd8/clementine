import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import SessionsScreen from '../../app/sessions';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

const mockStartNew = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    isLoading: false,
    error: null,
    resumingSessionId: null,
    resume: jest.fn(),
    send: jest.fn(),
    fork: jest.fn(),
    refresh: jest.fn(),
    startNew: mockStartNew,
  }),
}));

describe('SessionsScreen — NEW SESSION', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a NEW SESSION button', async () => {
    await render(<SessionsScreen />);
    expect(screen.getByText('NEW SESSION')).toBeTruthy();
  });

  it('calls startNew when NEW SESSION is pressed', async () => {
    await render(<SessionsScreen />);
    fireEvent.press(screen.getByText('NEW SESSION'));
    expect(mockStartNew).toHaveBeenCalled();
  });
});

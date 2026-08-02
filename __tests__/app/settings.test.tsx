import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { darkTheme } from '@/constants/theme';
import { useBudgetStore, DEFAULT_DAILY_LIMIT } from '@/stores/budget';
import { useSettingsStore } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import { VOICE_PROFILE_DEFAULTS } from '@/types/voice';

import SettingsScreen from '../../app/(tabs)/settings';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('SettingsScreen', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useBudgetStore.setState({ dailyLimit: DEFAULT_DAILY_LIMIT, hydrated: true });
    useVoiceProfileStore.setState({
      profile: { ...VOICE_PROFILE_DEFAULTS },
      hydrated: true,
    });
  });

  /**
   * The chat header used to carry a one-label cycling toggle. The design
   * gives theme a three-up row here instead, so all three states are visible
   * at once rather than requiring two taps to discover.
   */
  it('offers all three theme preferences at once', async () => {
    await render(<SettingsScreen />);
    for (const option of ['system', 'light', 'dark']) {
      expect(screen.getByTestId(`theme-${option}`)).toBeTruthy();
    }
  });

  it('fills the current preference gold and leaves the rest raised', async () => {
    await render(<SettingsScreen />);
    expect(flatten(screen.getByTestId('theme-dark').props.style).backgroundColor).toBe(
      darkTheme.colors.gold,
    );
    expect(flatten(screen.getByTestId('theme-light').props.style).backgroundColor).toBe(
      darkTheme.colors.canvasRaised,
    );
  });

  it('applies a preference when tapped', async () => {
    await render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('theme-light'));
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('tells screen readers which preference is selected', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByTestId('theme-dark').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('theme-system').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('offers the design’s speech-to-text providers and selects one', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('On-device whisper.cpp (free)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('option-asr-groq'));
    await waitFor(() =>
      expect(useVoiceProfileStore.getState().profile.asr.provider).toBe('groq'),
    );
  });

  it('offers the design’s text-to-speech providers and selects one', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Edge TTS (free)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('option-tts-elevenlabs'));
    await waitFor(() =>
      expect(useVoiceProfileStore.getState().profile.tts.provider).toBe('elevenlabs'),
    );
  });

  it('edits the daily token budget, digits only', async () => {
    await render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Daily token budget'), '20o000');
    await waitFor(() => expect(useBudgetStore.getState().dailyLimit).toBe(20_000));
  });

  it('says the budget cannot actually stop the server', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(/non-blocking warning only/)).toBeTruthy();
  });
});

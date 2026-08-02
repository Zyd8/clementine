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
    expect(screen.getByText('Groq Whisper (free tier)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('asr-groq'));
    await waitFor(() =>
      expect(useVoiceProfileStore.getState().profile.asr.provider).toBe('groq'),
    );
  });

  it('offers the design’s text-to-speech providers and selects one', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Edge TTS (free)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tts-elevenlabs'));
    await waitFor(() =>
      expect(useVoiceProfileStore.getState().profile.tts.provider).toBe('elevenlabs'),
    );
  });

  it('edits the daily token budget, digits only', async () => {
    await render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Daily token budget'), '20o000');
    await waitFor(() => expect(useBudgetStore.getState().dailyLimit).toBe(20_000));
  });

  /**
   * The bug this covers: the provider pickers lived here while every key
   * field lived on a second screen that nothing routed to any more. You could
   * pick Groq and have no reachable way to give it a key.
   */
  describe('provider keys', () => {
    it('opens the key field inside the selected ASR provider’s row', async () => {
      await render(<SettingsScreen />);
      expect(screen.getByTestId('asr-groq-key')).toBeTruthy();
      expect(screen.getByLabelText('ASR API Key')).toBeTruthy();
    });

    it('leaves unselected providers closed', async () => {
      await render(<SettingsScreen />);
      expect(screen.queryByTestId('asr-deepgram-key')).toBeNull();
    });

    it('stores the ASR key as it is typed', async () => {
      await render(<SettingsScreen />);
      fireEvent.changeText(screen.getByLabelText('ASR API Key'), 'gsk_typed');
      await waitFor(() =>
        expect(useVoiceProfileStore.getState().profile.asr.apiKey).toBe('gsk_typed'),
      );
    });

    it('asks for a TTS key once a keyed voice is picked', async () => {
      useVoiceProfileStore.setState({
        profile: { ...VOICE_PROFILE_DEFAULTS, tts: { provider: 'elevenlabs' } },
        hydrated: true,
      });
      await render(<SettingsScreen />);
      expect(screen.getByLabelText('TTS API Key')).toBeTruthy();
    });

    /** The phone's own voice and Edge's free endpoint take no key. */
    it.each(['device', 'edge'] as const)(
      'opens nothing when the keyless %s voice is picked',
      async (provider) => {
        useVoiceProfileStore.setState({
          profile: { ...VOICE_PROFILE_DEFAULTS, tts: { provider } },
          hydrated: true,
        });
        await render(<SettingsScreen />);
        expect(screen.queryByLabelText('TTS API Key')).toBeNull();
      },
    );

    /**
     * Paste in, no copy out. Masking is what suppresses Copy and Cut on both
     * platforms; hiding the context menu would take Paste with it and leave a
     * 56-character key to be typed by hand.
     */
    it('masks the key but still allows pasting into it', async () => {
      await render(<SettingsScreen />);
      const input = screen.getByLabelText('ASR API Key');
      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.contextMenuHidden).toBeFalsy();
    });

  });

  describe('voice timing', () => {
    it('tunes the silence timeout that ends a turn', async () => {
      await render(<SettingsScreen />);
      fireEvent.press(screen.getByLabelText('Increase END OF SPEECH'));
      await waitFor(() =>
        expect(useVoiceProfileStore.getState().profile.endOfSpeechTimeoutMs).toBe(1000),
      );
    });

    it('tunes the maximum recording length', async () => {
      await render(<SettingsScreen />);
      fireEvent.press(screen.getByLabelText('Increase MAX RECORDING'));
      await waitFor(() =>
        expect(useVoiceProfileStore.getState().profile.maxRecordingMs).toBe(75_000),
      );
    });

    it('sets what happens when the user talks over a reply', async () => {
      await render(<SettingsScreen />);
      fireEvent.press(screen.getByTestId('option-interrupt-stop_speech_only'));
      await waitFor(() =>
        expect(useVoiceProfileStore.getState().profile.interruptBehavior).toBe(
          'stop_speech_only',
        ),
      );
    });
  });

  it('says the budget cannot actually stop the server', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(/non-blocking warning only/)).toBeTruthy();
  });
});

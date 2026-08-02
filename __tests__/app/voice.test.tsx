import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { darkTheme } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import { VOICE_PROFILE_DEFAULTS } from '@/types/voice';
import type { VoiceChatState } from '@/types/voice';

import VoiceScreen from '../../app/voice';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: jest.fn(() => 'dark'),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const mockTapMic = jest.fn();
let mockVoiceState: VoiceChatState = 'LISTENING';
let mockTranscript = '';

jest.mock('@/hooks/useVoiceChat', () => ({
  useVoiceChat: () => ({
    voiceState: mockVoiceState,
    liveTranscript: mockTranscript,
    audioLevel: 0.5,
    tapMic: mockTapMic,
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 48, left: 0, right: 0, bottom: 24 },
};

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const show = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <VoiceScreen />
    </SafeAreaProvider>,
  );

describe('VoiceScreen', () => {
  beforeEach(() => {
    mockTapMic.mockClear();
    mockVoiceState = 'LISTENING';
    mockTranscript = '';
    useSettingsStore.setState({ theme: 'dark', hydrated: true });
    useVoiceProfileStore.setState({
      profile: {
        ...VOICE_PROFILE_DEFAULTS,
        asr: { provider: 'groq', apiKey: 'test-key' },
      },
      hydrated: true,
    });
  });

  it('renders the design’s chrome', async () => {
    await show();
    expect(screen.getByText('VOICE MODE')).toBeTruthy();
    expect(screen.getByText('TOOL FEED STAYS LIVE IN CHAT')).toBeTruthy();
    expect(screen.getByLabelText('Stop and return')).toBeTruthy();
  });

  /** The user tapped a mic to get here — opening the screen is the tap. */
  it('opens the mic on mount when the machine is idle', async () => {
    mockVoiceState = 'IDLE';
    await show();
    await waitFor(() => expect(mockTapMic).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['LISTENING', 'listening'],
    ['PROCESSING', 'thinking'],
    ['PLAYING', 'speaking'],
  ] as const)('labels %s as "%s", the design’s wording', async (state, label) => {
    mockVoiceState = state;
    await show();
    expect(screen.getByText(label)).toBeTruthy();
  });

  /** IDLE would read as broken on a screen the user opened to talk. */
  it('presents the pre-arm instant as listening, not idle', async () => {
    mockVoiceState = 'IDLE';
    await show();
    expect(screen.getByText('listening')).toBeTruthy();
  });

  it('rings the ring gold while live', async () => {
    mockVoiceState = 'LISTENING';
    await show();
    const ring = flatten(screen.getByTestId('voice-ring').props.style);
    expect(ring.borderColor).toBe(darkTheme.colors.gold);
    expect(ring.borderWidth).toBe(2);
  });

  it('drops the ring to steel while thinking', async () => {
    mockVoiceState = 'PROCESSING';
    await show();
    const ring = flatten(screen.getByTestId('voice-ring').props.style);
    expect(ring.borderColor).toBe(darkTheme.colors.steel);
    expect(ring.borderWidth).toBe(1);
  });

  it('shows the live transcript', async () => {
    mockTranscript = 'check the api server';
    await show();
    expect(screen.getByText('check the api server')).toBeTruthy();
  });

  /**
   * Transcription is a cloud call, so without a key the mic would record a
   * clip, upload it, and fail. Say what is missing before anyone speaks.
   */
  describe('without an ASR key', () => {
    beforeEach(() => {
      useVoiceProfileStore.setState({
        profile: { ...VOICE_PROFILE_DEFAULTS, asr: { provider: 'groq' } },
        hydrated: true,
      });
    });

    it('says a key is needed instead of opening the mic', async () => {
      mockVoiceState = 'IDLE';
      await show();

      expect(screen.getByText('voice needs a key')).toBeTruthy();
      expect(screen.getByText(/Settings → Voice/)).toBeTruthy();
      await waitFor(() => expect(mockTapMic).not.toHaveBeenCalled());
    });
  });

  it('stops the session and returns on close', async () => {
    const { router } = jest.requireMock('expo-router') as {
      router: { back: jest.Mock };
    };
    router.back.mockClear();

    await show();
    fireEvent.press(screen.getByLabelText('Stop and return'));
    expect(mockTapMic).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('returns without a teardown tap when nothing is running', async () => {
    mockVoiceState = 'IDLE';
    await show();
    mockTapMic.mockClear();

    fireEvent.press(screen.getByLabelText('Close voice mode'));
    expect(mockTapMic).not.toHaveBeenCalled();
  });
});

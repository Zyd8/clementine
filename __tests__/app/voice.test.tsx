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
    speechThreshold: 0.4,
    voiceStatus: '',
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
        asr: { provider: 'groq', keys: { groq: 'test-key' } },
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
        profile: {
          ...VOICE_PROFILE_DEFAULTS,
          asr: { provider: 'groq', keys: {} },
        },
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


/**
 * The ring is the only affordance on this screen — no separate mic button.
 * It was a plain View, so there was no way to reach the state machine's
 * cancel/interrupt paths at all; both existed and were unreachable.
 */
describe('VoiceScreen — the ring as a tap target', () => {
  it('hands a tap on the ring to the state machine while the reply plays', async () => {
    mockVoiceState = 'PLAYING';
    await show();
    mockTapMic.mockClear();

    fireEvent.press(screen.getByTestId('voice-ring'));

    expect(mockTapMic).toHaveBeenCalled();
  });

  it('hands a tap on the ring to the state machine while listening', async () => {
    mockVoiceState = 'LISTENING';
    await show();
    mockTapMic.mockClear();

    fireEvent.press(screen.getByTestId('voice-ring'));

    expect(mockTapMic).toHaveBeenCalled();
  });

  it('says a tap will interrupt while the reply plays', async () => {
    mockVoiceState = 'PLAYING';
    await show();

    expect(screen.getByTestId('voice-ring').props.accessibilityLabel).toMatch(
      /interrupt/i,
    );
  });

  it('says a tap will stop listening while listening', async () => {
    mockVoiceState = 'LISTENING';
    await show();

    expect(screen.getByTestId('voice-ring').props.accessibilityLabel).toMatch(
      /stop listening/i,
    );
  });

  /** Nothing to interrupt yet — the ring goes inert rather than swallowing a tap. */
  it('disables the ring while thinking, with nothing to interrupt', async () => {
    mockVoiceState = 'PROCESSING';
    await show();

    expect(screen.getByTestId('voice-ring').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    mockTapMic.mockClear();
    fireEvent.press(screen.getByTestId('voice-ring'));
    expect(mockTapMic).not.toHaveBeenCalled();
  });
});

/**
 * The ring alone was easy to miss as an interrupt control — nothing on
 * screen told you tapping it would cut the reply off. A small stop-shaped
 * button makes the affordance explicit while the reply plays, without
 * removing the ring's own tap handling.
 */
describe('VoiceScreen — dedicated interrupt button', () => {
  it('shows an interrupt button while the reply plays', async () => {
    mockVoiceState = 'PLAYING';
    await show();

    expect(screen.getByTestId('voice-interrupt-button')).toBeTruthy();
  });

  it('interrupts on press', async () => {
    mockVoiceState = 'PLAYING';
    await show();
    mockTapMic.mockClear();

    fireEvent.press(screen.getByTestId('voice-interrupt-button'));

    expect(mockTapMic).toHaveBeenCalled();
  });

  /** Nothing to interrupt outside PLAYING — the button would be misleading. */
  it.each(['IDLE', 'LISTENING', 'PROCESSING'] as const)(
    'hides the interrupt button in %s',
    async (state) => {
      mockVoiceState = state;
      await show();

      expect(screen.queryByTestId('voice-interrupt-button')).toBeNull();
    },
  );
});

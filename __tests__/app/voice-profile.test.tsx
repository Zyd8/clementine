import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSettingsStore } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';

import VoiceProfileScreen from '../../app/voice-profile';

/** Without initialMetrics the provider renders nothing until it measures. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 48, left: 0, right: 0, bottom: 24 },
};

beforeEach(() => {
  useSettingsStore.setState({ theme: 'dark' });
  useVoiceProfileStore.setState({
    profile: {
      asr: { provider: 'groq' },
      tts: { provider: 'edge' },
      interruptBehavior: 'stop_speech_and_run',
      endOfSpeechTimeoutMs: 900,
      maxRecordingMs: 60_000,
    },
    hydrated: true,
  });
});

describe('VoiceProfileScreen', () => {
  it('renders the ASR provider heading', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('Speech Recognition')).toBeTruthy();
  });

  it('renders the TTS provider heading', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('Text-to-Speech')).toBeTruthy();
  });

  it('renders timing controls', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('End of speech timeout')).toBeTruthy();
    expect(screen.getByText('Max recording duration')).toBeTruthy();
  });

  it('renders ASR provider options', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('groq')).toBeTruthy();
    expect(screen.getByText('groq')).toBeTruthy();
    expect(screen.getByText('deepgram')).toBeTruthy();
    // 'openai' appears in both ASR and TTS lists — use getAllByText
    const openaiElements = screen.getAllByText('openai');
    expect(openaiElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders TTS provider options', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('edge')).toBeTruthy();
    expect(screen.getByText('elevenlabs')).toBeTruthy();
    expect(screen.getByText('minimax')).toBeTruthy();
  });

  /**
   * Phase 11's exit criterion: picking a voice asks for the key that voice
   * needs, and does not ask when it needs none.
   */
  it.each(['groq', 'deepgram', 'openai'] as const)(
    'asks for a key when %s is the picked ASR provider',
    async (provider) => {
      useVoiceProfileStore.setState({
        profile: { ...useVoiceProfileStore.getState().profile, asr: { provider } },
      });
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <VoiceProfileScreen />
        </SafeAreaProvider>,
      );
      expect(screen.getByText('ASR API Key')).toBeTruthy();
    },
  );

  it.each(['elevenlabs', 'openai', 'minimax'] as const)(
    'asks for a key when %s is the picked TTS provider',
    async (provider) => {
      useVoiceProfileStore.setState({
        profile: { ...useVoiceProfileStore.getState().profile, tts: { provider } },
      });
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <VoiceProfileScreen />
        </SafeAreaProvider>,
      );
      expect(screen.getByText('TTS API Key')).toBeTruthy();
    },
  );

  /** The phone's own voice and Edge's free endpoint take no key. */
  it.each(['device', 'edge'] as const)(
    'asks for no key when %s is the picked TTS provider',
    async (provider) => {
      useVoiceProfileStore.setState({
        profile: { ...useVoiceProfileStore.getState().profile, tts: { provider } },
      });
      await render(
        <SafeAreaProvider initialMetrics={METRICS}>
          <VoiceProfileScreen />
        </SafeAreaProvider>,
      );
      expect(screen.queryByText('TTS API Key')).toBeNull();
    },
  );

  it('masks the key fields and blocks copying them out', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        asr: { provider: 'groq' },
        tts: { provider: 'elevenlabs' },
      },
    });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoiceProfileScreen />
      </SafeAreaProvider>,
    );

    for (const label of ['ASR API Key', 'TTS API Key']) {
      const input = screen.getByLabelText(label);
      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.contextMenuHidden).toBe(true);
      expect(input.props.importantForAutofill).toBe('no');
    }
  });

  /** Every ASR provider is a cloud service now, so all of them need a key. */
  it('shows the ASR API key field for groq', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        asr: { provider: 'groq' },
      },
    });
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('ASR API Key')).toBeTruthy();
  });

  it('shows ASR API key field for groq (BYO key required)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        asr: { provider: 'groq' },
      },
    });
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('ASR API Key')).toBeTruthy();
  });

  it('does not show TTS key fields for edge (free default)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        tts: { provider: 'edge' },
      },
    });
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.queryByText('TTS API Key')).toBeNull();
  });

  it('shows TTS key fields for elevenlabs (BYO key required)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        tts: { provider: 'elevenlabs' },
      },
    });
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('TTS API Key')).toBeTruthy();
    expect(screen.getByText('Voice ID')).toBeTruthy();
  });

  it('renders a SAVE button', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    expect(screen.getByText('SAVE')).toBeTruthy();
  });

  it('shows current timeout values', async () => {
    await render(<SafeAreaProvider initialMetrics={METRICS}><VoiceProfileScreen /></SafeAreaProvider>);
    // The steppers show the numeric values with units
    expect(screen.getByText('900ms')).toBeTruthy();
    expect(screen.getByText('60000ms')).toBeTruthy();
  });
});

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { useSettingsStore } from '@/stores/settings';
import { useVoiceProfileStore } from '@/stores/voiceProfile';

import VoiceProfileScreen from './voice-profile';

beforeEach(() => {
  useSettingsStore.setState({ theme: 'dark' });
  useVoiceProfileStore.setState({
    profile: {
      asr: { provider: 'whisper_cpp' },
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
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('Speech Recognition')).toBeTruthy();
  });

  it('renders the TTS provider heading', async () => {
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('Text-to-Speech')).toBeTruthy();
  });

  it('renders timing controls', async () => {
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('End of speech timeout')).toBeTruthy();
    expect(screen.getByText('Max recording duration')).toBeTruthy();
  });

  it('renders ASR provider options', async () => {
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('whisper cpp')).toBeTruthy();
    expect(screen.getByText('groq')).toBeTruthy();
    expect(screen.getByText('deepgram')).toBeTruthy();
    // 'openai' appears in both ASR and TTS lists — use getAllByText
    const openaiElements = screen.getAllByText('openai');
    expect(openaiElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders TTS provider options', async () => {
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('edge')).toBeTruthy();
    expect(screen.getByText('elevenlabs')).toBeTruthy();
    expect(screen.getByText('minimax')).toBeTruthy();
  });

  it('does not show ASR API key field for whisper_cpp (free default)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        asr: { provider: 'whisper_cpp' },
      },
    });
    await render(<VoiceProfileScreen />);
    expect(screen.queryByText('ASR API Key')).toBeNull();
  });

  it('shows ASR API key field for groq (BYO key required)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        asr: { provider: 'groq' },
      },
    });
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('ASR API Key')).toBeTruthy();
  });

  it('does not show TTS key fields for edge (free default)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        tts: { provider: 'edge' },
      },
    });
    await render(<VoiceProfileScreen />);
    expect(screen.queryByText('TTS API Key')).toBeNull();
  });

  it('shows TTS key fields for elevenlabs (BYO key required)', async () => {
    useVoiceProfileStore.setState({
      profile: {
        ...useVoiceProfileStore.getState().profile,
        tts: { provider: 'elevenlabs' },
      },
    });
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('TTS API Key')).toBeTruthy();
    expect(screen.getByText('Voice ID')).toBeTruthy();
  });

  it('renders a SAVE button', async () => {
    await render(<VoiceProfileScreen />);
    expect(screen.getByText('SAVE')).toBeTruthy();
  });

  it('shows current timeout values', async () => {
    await render(<VoiceProfileScreen />);
    // The steppers show the numeric values with units
    expect(screen.getByText('900ms')).toBeTruthy();
    expect(screen.getByText('60000ms')).toBeTruthy();
  });
});

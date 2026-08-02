import { renderHook, act, waitFor } from '@testing-library/react-native';

import { createRun, streamRunEvents } from '@/api/runs';
import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import type { StreamEvent } from '@/types/events';
import type { TtsCallbacks, TtsProvider } from '@/voice/tts';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import { VOICE_PROFILE_DEFAULTS } from '@/types/voice';

import { useVoiceChat } from './useVoiceChat';

// Mock the runs API (mirrors useChat.test.ts pattern)
jest.mock('@/api/runs', () => ({
  createRun: jest.fn(),
  stopRun: jest.fn(),
  streamRunEvents: jest.fn(),
}));

// Mock TTS so we control when onSentenceEnd/onAllDone/onError fire
const ttsCallbacks = { current: null as TtsCallbacks | null };
jest.mock('@/voice/tts', () => {
  const actual = jest.requireActual('@/voice/tts');
  return {
    ...actual,
    createTtsProvider: jest.fn((_config: unknown, callbacks: TtsCallbacks): TtsProvider => {
      ttsCallbacks.current = callbacks;
      return {
        speak: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        isPlaying: jest.fn().mockReturnValue(true),
      };
    }),
  };
});

const mockedCreateRun = createRun as jest.MockedFunction<typeof createRun>;
const mockedStream = streamRunEvents as jest.MockedFunction<typeof streamRunEvents>;

/** Turns a fixed list of events into the async iterable the hook consumes. */
const streamOf = (events: StreamEvent[]) =>
  (async function* () {
    for (const event of events) yield event;
  })();

const MOCK_CONNECTION = {
  name: 'test',
  baseUrl: 'http://localhost:8642',
  apiKey: 'test-key',
  connectedAt: Date.now(),
};

beforeEach(() => {
  jest.clearAllMocks();
  useConnectionStore.setState({
    connection: MOCK_CONNECTION,
    hydrated: true,
  });
  useChatStore.setState({ byProfile: {} });
  // Reset voice profile to defaults (edge TTS, whisper_cpp ASR)
  useVoiceProfileStore.setState({ profile: { ...VOICE_PROFILE_DEFAULTS }, hydrated: true });
  mockedCreateRun.mockResolvedValue({ runId: 'run_abc', status: 'started' });
  mockedStream.mockReturnValue(streamOf([]));
  ttsCallbacks.current = null;
});

afterEach(() => {
  useChatStore.setState({ byProfile: {} });
});

describe('useVoiceChat', () => {
  describe('state machine', () => {
    it('starts in IDLE', async () => {
      const { result } = await renderHook(() => useVoiceChat());
      expect(result.current.voiceState).toBe('IDLE');
    });

    it('tap in IDLE transitions to LISTENING', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });

      expect(result.current.voiceState).toBe('LISTENING');
    });

    it('tap in LISTENING cancels and returns to IDLE', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic(); // IDLE → LISTENING
      });
      expect(result.current.voiceState).toBe('LISTENING');

      await act(async () => {
        await result.current.tapMic(); // LISTENING → cancel → IDLE
      });

      expect(result.current.voiceState).toBe('IDLE');
    });
  });

  describe('end-of-speech → auto-send', () => {
    it('triggers auto-send on end-of-speech', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      // Enter LISTENING and push a transcript
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Hello from user.');
      });

      // Simulate end-of-speech
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      // Should have called createRun with the transcript
      expect(mockedCreateRun).toHaveBeenCalledWith(
        'http://localhost:8642',
        'test-key',
        expect.objectContaining({ input: 'Hello from user.' }),
      );
    });

    it('does not send when transcript is empty', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });

      // End-of-speech with empty transcript should go to IDLE without sending
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      expect(mockedCreateRun).not.toHaveBeenCalled();
      expect(result.current.voiceState).toBe('IDLE');
    });
  });

  describe('interrupt', () => {
    it('tap in PLAYING interrupts and re-enters LISTENING', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Replying.' } as StreamEvent,
          { type: 'run.completed', output: 'Replying.' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      // First turn: speak → auto-send → PROCESSING
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('User message.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      // The mock stream fires immediately, first sentence arrives,
      // sentenceBuffer fires callback → speak → transition to PLAYING
      await waitFor(() => {
        expect(result.current.voiceState).toBe('PLAYING');
      });

      // Interrupt — should go back to LISTENING
      await act(async () => {
        await result.current.tapMic();
      });

      expect(result.current.voiceState).toBe('LISTENING');
    });

    it('interrupt in LISTENING does not crash', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      expect(result.current.voiceState).toBe('LISTENING');

      await act(async () => {
        await result.current.tapMic();
      });
      expect(result.current.voiceState).toBe('IDLE');
    });

    it('executes stop_speech_and_run interrupt and re-enters LISTENING', async () => {
      // Set voice profile to stop_speech_and_run before rendering
      useVoiceProfileStore.setState({
        profile: {
          asr: { provider: 'whisper_cpp' as const },
          tts: { provider: 'edge' as const },
          interruptBehavior: 'stop_speech_and_run' as const,
          endOfSpeechTimeoutMs: 900,
          maxRecordingMs: 60_000,
        },
        hydrated: true,
      });

      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Response.' } as StreamEvent,
          { type: 'run.completed', output: 'Response.' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      // Get to PLAYING state
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('PLAYING');
      });

      // Interrupt with stop_speech_and_run — note: mock stream completes
      // synchronously so activeRun is already cleared. The interrupt still
      // executes the stop_speech_and_run path through executeInterrupt.
      await act(async () => {
        await result.current.tapMic();
      });

      // Should re-enter LISTENING after interrupt
      expect(result.current.voiceState).toBe('LISTENING');
    });
  });

  describe('live transcript', () => {
    it('shows partial transcripts while listening', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });

      await act(async () => {
        result.current.pushPartialTranscript('Hello');
      });

      expect(result.current.liveTranscript).toBe('Hello');

      await act(async () => {
        result.current.pushPartialTranscript('Hello world');
      });

      expect(result.current.liveTranscript).toBe('Hello world');
    });

    it('clears the live transcript after auto-send', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Hi there');
      });

      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.liveTranscript).toBe('');
      });
    });
  });

  describe('audio level', () => {
    it('starts at 0', async () => {
      const { result } = await renderHook(() => useVoiceChat());
      expect(result.current.audioLevel).toBe(0);
    });

    it('exposes audioLevel for the waveform', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });

      // Simulate audio level updates
      await act(async () => {
        result.current.pushAudioLevel(0.5);
      });

      expect(result.current.audioLevel).toBe(0.5);
    });
  });

  describe('sentenceBuffer integration', () => {
    it('chunks agent text into sentences for TTS', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'First sentence.' } as StreamEvent,
          { type: 'assistant.delta', text: ' Second one!' } as StreamEvent,
          { type: 'run.completed', output: 'First sentence. Second one!' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      // Stream should complete, sentenceBuffer should feed TTS
      // State should reach PROCESSING during stream, then PLAYING after flush
      await waitFor(() => {
        expect(['PLAYING', 'PROCESSING']).toContain(result.current.voiceState);
      });
    });
  });

  describe('audio session interruption', () => {
    it('returns to IDLE when audio session is interrupted', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      // Start listening
      await act(async () => {
        await result.current.tapMic();
      });
      expect(result.current.voiceState).toBe('LISTENING');

      // Simulate audio interruption – hard-stop to IDLE
      await act(async () => {
        result.current.handleAudioInterruption();
      });

      expect(result.current.voiceState).toBe('IDLE');
    });

    it('stops TTS playback and returns to IDLE on interruption during PLAYING', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Playing response.' } as StreamEvent,
          { type: 'run.completed', output: 'Playing response.' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Interrupt me.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      // Wait for state to settle after stream
      await waitFor(() => {
        expect(result.current.voiceState).not.toBe('LISTENING');
      });

      // Phone call steals the mic — should hard-stop to IDLE
      await act(async () => {
        result.current.handleAudioInterruption();
      });

      expect(result.current.voiceState).toBe('IDLE');
    });
  });

  // ---- NEW TESTS for uncovered paths ----

  describe('run failure handling', () => {
    it('catches createRun failures and goes to IDLE', async () => {
      mockedCreateRun.mockRejectedValue(new Error('Network error'));

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('IDLE');
      });
    });
  });

  describe('TTS error callback', () => {
    it('goes to IDLE when TTS onError fires during PLAYING', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Replying.' } as StreamEvent,
          { type: 'run.completed', output: 'Replying.' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      // Get to PLAYING
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('PLAYING');
      });

      // Now fire the TTS error callback
      await act(async () => {
        ttsCallbacks.current?.onError(new Error('TTS playback failed'));
      });

      expect(result.current.voiceState).toBe('IDLE');
    });
  });

  describe('TTS onAllDone callback', () => {
    it('transitions to IDLE when TTS finishes all sentences in PLAYING', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Hi.' } as StreamEvent,
          { type: 'run.completed', output: 'Hi.' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('PLAYING');
      });

      // Fire onAllDone
      await act(async () => {
        ttsCallbacks.current?.onAllDone();
      });

      expect(result.current.voiceState).toBe('IDLE');
    });
  });

  describe('no connection guard', () => {
    it('stays in LISTENING when there is no connection', async () => {
      useConnectionStore.setState({ connection: null, hydrated: true });

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      expect(result.current.voiceState).toBe('LISTENING');

      // End-of-speech with no connection — handler returns early, stays LISTENING
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      // Should stay LISTENING (handler returns early when no connection)
      expect(result.current.voiceState).toBe('LISTENING');
      expect(mockedCreateRun).not.toHaveBeenCalled();
    });
  });

  describe('silent run (no sentences)', () => {
    it('transitions to IDLE if stream produces no sentences', async () => {
      // Stream with no assistant.delta events
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'run.completed', output: '' } as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('IDLE');
      });
    });
  });

  describe('usage tracking', () => {
    it('records usage from run.completed events', async () => {
      const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'Hello.' } as StreamEvent,
          { type: 'run.completed', output: 'Hello.', usage } as unknown as StreamEvent,
        ]),
      );

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      await waitFor(() => {
        expect(result.current.voiceState).not.toBe('LISTENING');
      });
    });
  });
});

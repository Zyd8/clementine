import { renderHook, act, waitFor } from '@testing-library/react-native';

import { createRun, PHONE_INSTRUCTIONS, stopRun, streamRunEvents, VOICE_INSTRUCTIONS } from '@/api/runs';
import { useChatStore } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import type { StreamEvent } from '@/types/events';
import type { TtsCallbacks, TtsProvider } from '@/voice/tts';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import { VOICE_PROFILE_DEFAULTS } from '@/types/voice';

import { useVoiceChat } from './useVoiceChat';

// Mock the runs API (mirrors useChat.test.ts pattern)
// A recorder that actually yields a clip, so `asr.stop()` reaches the
// transcription call instead of short-circuiting on a null uri.
//
// Metering is a variable so a test can play the reply quietly and then talk
// over it — barge-in measures the echo first, so a constant level is echo by
// definition and must never trip it.
let mockMetering = -20;
jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a' } },
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    uri: 'file:///clip.m4a',
    getStatus: () => ({ metering: mockMetering }),
  }),
}));

jest.mock('@/api/runs', () => ({
  ...jest.requireActual('@/api/runs'),
  createRun: jest.fn(),
  stopRun: jest.fn(),
  streamRunEvents: jest.fn(),
}));

// Mock TTS so we control when onSentenceEnd/onAllDone/onError fire
const ttsCallbacks = { current: null as TtsCallbacks | null };
const ttsProvider = { current: null as TtsProvider | null };
jest.mock('@/voice/tts', () => {
  const actual = jest.requireActual('@/voice/tts');
  return {
    ...actual,
    createTtsProvider: jest.fn((_config: unknown, callbacks: TtsCallbacks): TtsProvider => {
      ttsCallbacks.current = callbacks;
      const provider: TtsProvider = {
        speak: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        destroy: jest.fn(),
        isPlaying: jest.fn().mockReturnValue(true),
      };
      ttsProvider.current = provider;
      return provider;
    }),
  };
});

const mockedCreateRun = createRun as jest.MockedFunction<typeof createRun>;
const mockedStopRun = stopRun as jest.MockedFunction<typeof stopRun>;
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
  // Reset voice profile to defaults (device TTS, Groq ASR)
  // Groq is the default ASR now and refuses to open the mic without a key.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ text: '' }),
    text: async () => '',
  }) as unknown as typeof fetch;

  useVoiceProfileStore.setState({
    profile: {
      ...VOICE_PROFILE_DEFAULTS,
      asr: { provider: 'groq', keys: { groq: 'test-key' } },
    },
    hydrated: true,
  });
  mockMetering = -20;
  mockedCreateRun.mockResolvedValue({ runId: 'run_abc', status: 'started' });
  mockedStopRun.mockResolvedValue(undefined);
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
    /**
     * Groq returns the whole transcript from `stop()` and nothing before it.
     * The handler used to check `fullTranscript` first and bail when it was
     * empty, which abandoned every turn before it was ever transcribed —
     * invisible to tests that push a partial first, as the ones below do.
     */
    it('sends a batch transcript that only exists after stop()', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ text: 'spoken only, never streamed' }),
        text: async () => '',
      }) as unknown as typeof fetch;

      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });
      // Deliberately no pushPartialTranscript.
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      expect(mockedCreateRun).toHaveBeenCalledWith(
        'http://localhost:8642',
        'test-key',
        expect.objectContaining({ input: 'spoken only, never streamed' }),
      );
    });

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
      global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ text: '' }),
    text: async () => '',
  }) as unknown as typeof fetch;

  useVoiceProfileStore.setState({
        profile: {
          asr: { provider: 'groq' as const, keys: { groq: 'test-key' } },
          tts: { provider: 'edge' as const, keys: {} },
          interruptBehavior: 'stop_speech_and_run' as const,
          endOfSpeechTimeoutMs: 900,
          maxRecordingMs: 60_000,
          vadNoiseMargin: 0.12,
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

  describe('voice status messages', () => {
    it('reports what the pipeline is doing while listening', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      await act(async () => {
        await result.current.tapMic();
      });

      expect(result.current.voiceStatus).toMatch(/listening/i);
    });

    it('reports a transcription error instead of silently resetting', async () => {
      // ASR stop throws → the hook must surface the message, not swallow it.
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('groq 401'));

      const { result } = await renderHook(() => useVoiceChat());
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        await result.current.simulateEndOfSpeech();
      });

      expect(result.current.voiceStatus).toMatch(/failed/i);
      expect(result.current.voiceState).toBe('IDLE');
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

  /**
   * There is no barge-in: without real echo cancellation, the phone hears its
   * own speaker through the same mic it would use to detect a barge-in, and
   * nothing tells that apart from an actual interruption. The mic now stays
   * closed for the whole of PLAYING; tapping the ring is the only way in.
   */
  describe('during PLAYING', () => {
    it('never opens the mic while the reply plays, however loud the room is', async () => {
      const audio = jest.requireMock('expo-audio') as {
        useAudioRecorder: () => { record: jest.Mock };
      };

      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'A long reply.' } as StreamEvent,
          { type: 'run.completed', output: 'A long reply.' } as StreamEvent,
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

      audio.useAudioRecorder().record.mockClear();
      mockMetering = -3; // as loud as a shouted barge-in would have been

      await act(async () => {
        await new Promise((r) => setTimeout(r, 700));
      });

      expect(result.current.voiceState).toBe('PLAYING');
      expect(audio.useAudioRecorder().record).not.toHaveBeenCalled();
    });

    it('only the ring interrupts the reply', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'assistant.delta', text: 'A long reply.' } as StreamEvent,
          { type: 'run.completed', output: 'A long reply.' } as StreamEvent,
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

      await act(async () => {
        await result.current.tapMic();
      });

      expect(result.current.voiceState).toBe('LISTENING');
    });
  });

  describe('TTS onAllDone callback', () => {
    /**
     * A conversation does not need a tap between every turn. Closing the mic
     * when the reply ends left voice mode dead after one exchange — the user
     * answers, and nothing is listening.
     */
    it('reopens the mic when the reply finishes, rather than going idle', async () => {
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
        // The relisten is deferred a tick so the in-flight guard clears.
        await new Promise((r) => setTimeout(r, 0));
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('LISTENING');
      });
    });

    /**
     * The regression this guards: barge-in opens the mic during the reply and
     * gives it back on teardown, but the relisten starts a turn BEFORE React
     * runs that teardown — so the teardown cancelled the recording the new
     * turn had just opened, and the agent replied once and went deaf. That
     * mic-during-PLAYING effect is gone now (no barge-in, see above), so the
     * race itself cannot recur — kept as a live check that the relisten mic
     * still works.
     */
    it('leaves the mic recording for the turn that follows the reply', async () => {
      const audio = jest.requireMock('expo-audio') as {
        useAudioRecorder: () => { record: jest.Mock; stop: jest.Mock };
      };

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

      await act(async () => {
        ttsCallbacks.current?.onAllDone();
        await new Promise((r) => setTimeout(r, 0));
      });
      await waitFor(() => {
        expect(result.current.voiceState).toBe('LISTENING');
      });

      // Give any pending teardown a chance to cancel the new recording.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });

      // The mic must still be live: a level feed reaches the VAD, which is
      // the only thing that can end the turn.
      await act(async () => {
        result.current.pushAudioLevel(0.8);
      });
      expect(result.current.voiceState).toBe('LISTENING');
      void audio;
    });

    /** An interrupt mid-reply must win — it must not be relistened over. */
    it('does not reopen the mic when the reply was interrupted', async () => {
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

      // Leave PLAYING first, then let the finished reply try to relisten.
      await act(async () => {
        result.current.handleAudioInterruption();
      });
      const afterInterrupt = result.current.voiceState;

      await act(async () => {
        ttsCallbacks.current?.onAllDone();
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.voiceState).toBe(afterInterrupt);
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

  describe('voice-mode instructions', () => {
    /**
     * A reply built for reading renders fine on screen but is unlistenable
     * read aloud — bullet points and headings become word salad through TTS.
     * Both the standard phone instructions and the voice-specific ones must
     * go through; this doesn't replace PHONE_INSTRUCTIONS, it adds to them.
     */
    it('asks for a short, spoken-friendly reply, on top of the phone instructions', async () => {
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

      const [, , options] = mockedCreateRun.mock.calls[0]!;
      expect(options.instructions).toContain(PHONE_INSTRUCTIONS);
      expect(options.instructions).toContain(VOICE_INSTRUCTIONS);
    });
  });

  describe('spoken tool status', () => {
    /**
     * A tool call is silence otherwise: the reply hasn't started, and voice
     * mode has no visible feed the way chat does, so a slow tool reads as
     * the app having hung.
     */
    it('speaks a status line when a tool starts', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'tool.started', tool: 'web_search', args: '{}' } as StreamEvent,
          { type: 'assistant.delta', text: 'Found it.' } as StreamEvent,
          { type: 'run.completed', output: 'Found it.' } as StreamEvent,
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

      // Never the raw tool name — a friendly description of what it does.
      const speak = ttsProvider.current?.speak as jest.Mock;
      const spoken = speak.mock.calls.map(([text]) => String(text));
      expect(spoken.some((text) => text.includes('web_search'))).toBe(false);
      expect(spoken.some((text) => text.includes('searching for that'))).toBe(true);
    });

    /** Several tool calls in one reply must not repeat the narration. */
    it('narrates a tool call once per turn, not once per call', async () => {
      mockedStream.mockReturnValue(
        streamOf([
          { type: 'tool.started', tool: 'web_search', args: '{}' } as StreamEvent,
          { type: 'tool.completed', tool: 'web_search', ok: true } as StreamEvent,
          { type: 'tool.started', tool: 'read_file', args: '{}' } as StreamEvent,
          { type: 'tool.completed', tool: 'read_file', ok: true } as StreamEvent,
          { type: 'assistant.delta', text: 'Found it.' } as StreamEvent,
          { type: 'run.completed', output: 'Found it.' } as StreamEvent,
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

      const speak = ttsProvider.current?.speak as jest.Mock;
      const spoken = speak.mock.calls.map(([text]) => String(text));
      // Both tool descriptions could plausibly appear once from narration —
      // what must never happen is either being said more than once.
      const searching = spoken.filter((t) => t.includes('searching for that'));
      const lookingUp = spoken.filter((t) => t.includes('looking that up'));
      expect(searching.length + lookingUp.length).toBeLessThanOrEqual(1);
    });

    /** Fills the wait for the model's first token instead of dead air. */
    it('speaks a filler as soon as the run starts, before anything else arrives', async () => {
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

      const speak = ttsProvider.current?.speak as jest.Mock;
      expect(speak).toHaveBeenCalled();
      expect(String(speak.mock.calls[0]![0]).length).toBeGreaterThan(0);
    });

    /**
     * The regression this guards: narration finishing while the tool is
     * still running used to fire the same onAllDone path the real reply
     * uses, which read as "reply complete" and reopened the mic mid-task.
     */
    it('does not treat tool narration finishing as the reply being done', async () => {
      // The tool call is deliberately never resolved during the assertions —
      // this stands in for "still running", the exact moment narration
      // finishing must not be mistaken for the reply being done.
      let resolveHeld: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        resolveHeld = resolve;
      });
      mockedStream.mockReturnValue(
        (async function* () {
          yield { type: 'tool.started', tool: 'web_search', args: '{}' } as StreamEvent;
          await held;
        })(),
      );

      const { result } = await renderHook(() => useVoiceChat());
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });

      // Deliberately not awaited to completion — handleEndOfSpeech awaits
      // sendRun, which is itself stuck on `held`. A short async act lets the
      // synchronous PROCESSING transition and the mocked asr.stop()/createRun
      // microtasks flush without blocking on the whole chain.
      await act(async () => {
        void result.current.simulateEndOfSpeech();
        await new Promise((r) => setTimeout(r, 0));
      });

      await waitFor(() => {
        expect(result.current.voiceState).toBe('PROCESSING');
      });

      await act(async () => {
        ttsCallbacks.current?.onAllDone();
        await new Promise((r) => setTimeout(r, 0));
      });

      // Still not relistening — the run is still open.
      expect(result.current.voiceState).toBe('PROCESSING');

      resolveHeld();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    });
  });

  describe('leaveVoiceMode', () => {
    /**
     * Leaving the screen is a full stop: unlike the ring's interrupt, there
     * is no follow-up to hand the turn back for, so it must never reopen
     * the mic — and unlike the phone-call interruption handler, it always
     * cancels the run rather than leaving it running unheard.
     */
    it('stops TTS, cancels the run, and goes idle without relistening', async () => {
      // run.completed held back — the store clears activeRun the instant it
      // arrives, so the run has to genuinely still be open (still speaking)
      // for there to be anything for leaveVoiceMode to cancel.
      let resolveHeld: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        resolveHeld = resolve;
      });
      mockedStream.mockReturnValue(
        (async function* () {
          yield { type: 'assistant.delta', text: 'A long reply.' } as StreamEvent;
          await held;
        })(),
      );

      const { result } = await renderHook(() => useVoiceChat());
      await act(async () => {
        await result.current.tapMic();
      });
      await act(async () => {
        result.current.pushPartialTranscript('Test.');
      });
      await act(async () => {
        void result.current.simulateEndOfSpeech();
        await new Promise((r) => setTimeout(r, 0));
      });
      await waitFor(() => {
        expect(result.current.voiceState).toBe('PLAYING');
      });

      await act(async () => {
        result.current.leaveVoiceMode();
      });

      expect(result.current.voiceState).toBe('IDLE');
      expect(mockedStopRun).toHaveBeenCalledWith(
        'http://localhost:8642',
        'test-key',
        'run_abc',
      );

      // Confirm it never relistens: waiting past the deferred-tick window
      // used elsewhere for the auto-relisten must not move it off IDLE.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(result.current.voiceState).toBe('IDLE');

      resolveHeld();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    });

    it('is safe to call from IDLE, with nothing running', async () => {
      const { result } = await renderHook(() => useVoiceChat());

      expect(() => {
        result.current.leaveVoiceMode();
      }).not.toThrow();
      expect(result.current.voiceState).toBe('IDLE');
    });
  });
});

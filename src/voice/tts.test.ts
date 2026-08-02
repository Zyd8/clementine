import { createTtsProvider, type TtsCallbacks, type TtsProvider } from '@/voice/tts';
import * as Speech from 'expo-speech';

/**
 * A fake TTS provider for testing. Queues sentences and delivers callbacks
 * synchronously — no real audio.
 */
export function createFakeTtsProvider(): { provider: TtsProvider; callbacks: jest.Mocked<TtsCallbacks> } {
  let playing = false;

  const cbs: jest.Mocked<TtsCallbacks> = {
    onSentenceEnd: jest.fn(),
    onAllDone: jest.fn(),
    onError: jest.fn(),
  };

  const provider: TtsProvider = {
    speak: async (text: string): Promise<void> => {
      playing = true;
      cbs.onSentenceEnd();
      cbs.onAllDone();
      playing = false;
    },
    stop: async (): Promise<void> => {
      playing = false;
    },
    destroy: (): void => {
      playing = false;
    },
    isPlaying: (): boolean => playing,
  };

  return { provider, callbacks: cbs };
}

function makeCbs(): jest.Mocked<TtsCallbacks> {
  return {
    onSentenceEnd: jest.fn(),
    onAllDone: jest.fn(),
    onError: jest.fn(),
  };
}

describe('TTS provider interface', () => {
  describe('createTtsProvider', () => {
    it('returns an edge provider for free default (no key)', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'edge' }, cbs);
      expect(provider).toBeDefined();
      expect(typeof provider.speak).toBe('function');
      expect(typeof provider.stop).toBe('function');
      expect(typeof provider.destroy).toBe('function');
      expect(typeof provider.isPlaying).toBe('function');
    });

    it('returns an elevenlabs provider when selected', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: 'k1', voiceId: 'v1' },
        cbs,
      );
      expect(provider).toBeDefined();
    });

    it('returns an openai provider when selected', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'openai', apiKey: 'k1' },
        cbs,
      );
      expect(provider).toBeDefined();
    });

    it('returns a minimax provider when selected', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: 'k1', voiceId: 'default' },
        cbs,
      );
      expect(provider).toBeDefined();
    });
  });

  // ---- Edge TTS provider methods ----
  // speak()'s full pipeline (WSS → mp3 → playback) is exercised in
  // ./edgeTts.test.ts with an injected fake socket. Here only the lifecycle
  // that does not touch the network is covered.

  describe('Edge TTS provider', () => {
    it('creates an edge provider', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'edge' }, cbs);
      expect(provider).toBeDefined();
      expect(provider.isPlaying()).toBe(false);
    });

    it('stop sets isPlaying to false', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'edge' }, cbs);
      await provider.stop();
      expect(provider.isPlaying()).toBe(false);
    });

    it('destroy cleans up', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'edge' }, cbs);
      provider.destroy();
      expect(provider.isPlaying()).toBe(false);
    });
  });

  // ---- ElevenLabs TTS provider methods ----

  describe('ElevenLabs TTS provider', () => {
    /**
     * There is no synthesis behind ElevenLabs yet. It used to fire the done
     * callbacks anyway, which reported the reply spoken while the phone was
     * silent — a finished turn with no audio and nothing to explain it. Say
     * so instead, and name a voice that works.
     */
    it('refuses to speak rather than reporting a silent reply as done', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: 'key1', voiceId: 'v1' },
        cbs,
      );

      await expect(provider.speak('Hello.')).rejects.toThrow(/not implemented/i);

      expect(cbs.onSentenceEnd).not.toHaveBeenCalled();
      expect(cbs.onAllDone).not.toHaveBeenCalled();
      expect(cbs.onError).toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('points at a voice that does work', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: '', voiceId: 'v1' },
        cbs,
      );

      await expect(provider.speak('Hello.')).rejects.toThrow(/MiniMax|Edge|device/);
    });

    it('stop sets isPlaying to false', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: 'key1', voiceId: 'v1' },
        cbs,
      );
      await provider.stop();
      expect(provider.isPlaying()).toBe(false);
    });

    it('destroy cleans up resources', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: 'key1', voiceId: 'v1' },
        cbs,
      );
      provider.destroy();
      expect(provider.isPlaying()).toBe(false);
    });
  });

  // ---- OpenAI TTS provider methods ----

  describe('OpenAI TTS provider', () => {
    /** Same contract as ElevenLabs — see the note there. */
    it('refuses to speak rather than reporting a silent reply as done', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'openai', apiKey: 'key1' }, cbs);

      await expect(provider.speak('Hello.')).rejects.toThrow(/not implemented/i);

      expect(cbs.onSentenceEnd).not.toHaveBeenCalled();
      expect(cbs.onAllDone).not.toHaveBeenCalled();
      expect(cbs.onError).toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('stop sets isPlaying to false', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'openai', apiKey: 'key1' },
        cbs,
      );
      await provider.stop();
      expect(provider.isPlaying()).toBe(false);
    });

    it('destroy cleans up resources', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'openai', apiKey: 'key1' },
        cbs,
      );
      provider.destroy();
      expect(provider.isPlaying()).toBe(false);
    });
  });

  // ---- MiniMax TTS provider methods ----

  describe('MiniMax TTS provider', () => {
    /**
     * MiniMax is wired to the real T2A endpoint — `minimaxTts.test.ts` covers
     * the request and playback in detail. All this needs to prove is that the
     * factory hands back the real provider and not the old stub: it must call
     * the API before reporting anything spoken.
     */
    it('synthesizes through the API before reporting a sentence spoken', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { audio: '01020304', status: 2 },
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        text: async () => '',
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: 'key1', voiceId: 'default' },
        cbs,
      );

      await provider.speak('Hello.');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('minimax'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
      expect(cbs.onError).not.toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('speak without apiKey throws', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: '', voiceId: 'default' },
        cbs,
      );

      await expect(provider.speak('Hello.')).rejects.toThrow('MiniMax API key is required for TTS.');
      expect(cbs.onError).not.toHaveBeenCalled();
    });

    it('stop sets isPlaying to false', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: 'key1', voiceId: 'default' },
        cbs,
      );
      await provider.stop();
      expect(provider.isPlaying()).toBe(false);
    });

    it('destroy cleans up resources', () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: 'key1', voiceId: 'default' },
        cbs,
      );
      provider.destroy();
      expect(provider.isPlaying()).toBe(false);
    });
  });

  // ---- Fake provider harness (used by useVoiceChat tests) ----

  describe('fake TTS provider (test harness)', () => {
    it('speaks a sentence and calls onSentenceEnd + onAllDone', async () => {
      const { provider, callbacks } = createFakeTtsProvider();

      expect(provider.isPlaying()).toBe(false);
      await provider.speak('Hello.');

      expect(callbacks.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(callbacks.onAllDone).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(false);
    });

    it('stop sets isPlaying to false', async () => {
      const { provider } = createFakeTtsProvider();

      await provider.stop();
      expect(provider.isPlaying()).toBe(false);
    });

    it('destroy stops playback', async () => {
      const { provider } = createFakeTtsProvider();
      provider.destroy();
      expect(provider.isPlaying()).toBe(false);
    });

    it('does not error on empty text', async () => {
      const { provider, callbacks } = createFakeTtsProvider();

      await provider.speak('');
      // Empty text should still complete normally (no-op)
      expect(callbacks.onError).not.toHaveBeenCalled();
    });
  });
});

describe('device TTS — the free, offline default', () => {
  const callbacks = () => ({
    onSentenceEnd: jest.fn(),
    onAllDone: jest.fn(),
    onError: jest.fn(),
  });

  beforeEach(() => jest.clearAllMocks());

  it('speaks through the platform engine', async () => {
    const cb = callbacks();
    const tts = createTtsProvider({ provider: 'device' }, cb);

    await tts.speak('hello there');
    expect(Speech.speak).toHaveBeenCalledWith('hello there', expect.anything());
    expect(cb.onSentenceEnd).toHaveBeenCalled();
  });

  it('ignores an empty sentence rather than queueing silence', async () => {
    const cb = callbacks();
    const tts = createTtsProvider({ provider: 'device' }, cb);

    await tts.speak('   ');
    expect(Speech.speak).not.toHaveBeenCalled();
    expect(cb.onSentenceEnd).not.toHaveBeenCalled();
  });

  /**
   * Sentences arrive from the stream faster than they are spoken. Firing
   * onAllDone on the first completion would end the turn mid-reply.
   */
  it('reports all-done only once the queue drains', async () => {
    const cb = callbacks();
    let finish: (() => void)[] = [];
    (Speech.speak as jest.Mock).mockImplementation(
      (_t: string, o: { onDone?: () => void }) => {
        if (o.onDone) finish.push(o.onDone);
      },
    );

    const tts = createTtsProvider({ provider: 'device' }, cb);
    await tts.speak('first.');
    await tts.speak('second.');

    finish[0]?.();
    expect(cb.onAllDone).not.toHaveBeenCalled();

    finish[1]?.();
    expect(cb.onAllDone).toHaveBeenCalledTimes(1);
    finish = [];
  });

  it('stops playback and stays quiet about finishing', async () => {
    const cb = callbacks();
    (Speech.speak as jest.Mock).mockImplementation(() => undefined);
    const tts = createTtsProvider({ provider: 'device' }, cb);

    await tts.speak('a long reply.');
    expect(tts.isPlaying()).toBe(true);

    await tts.stop();
    expect(Speech.stop).toHaveBeenCalled();
    expect(tts.isPlaying()).toBe(false);
    expect(cb.onAllDone).not.toHaveBeenCalled();
  });

  it('surfaces an engine failure instead of dropping the turn', async () => {
    const cb = callbacks();
    (Speech.speak as jest.Mock).mockImplementation(
      (_t: string, o: { onError?: (e: Error) => void }) => {
        o.onError?.(new Error('engine unavailable'));
      },
    );

    const tts = createTtsProvider({ provider: 'device' }, cb);
    await tts.speak('hello');
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'engine unavailable',
    }));
  });
});

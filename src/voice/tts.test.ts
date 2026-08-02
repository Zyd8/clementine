import { createTtsProvider, type TtsCallbacks, type TtsProvider } from '@/voice/tts';

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

  describe('Edge TTS provider', () => {
    it('speak calls onSentenceEnd and onAllDone synchronously', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider({ provider: 'edge' }, cbs);

      expect(provider.isPlaying()).toBe(false);
      await provider.speak('Hello.');

      expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
      expect(cbs.onError).not.toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('speak captures callback errors and routes to onError', async () => {
      const cbs: jest.Mocked<TtsCallbacks> = {
        onSentenceEnd: jest.fn().mockImplementation(() => {
          throw new Error('callback boom');
        }),
        onAllDone: jest.fn(),
        onError: jest.fn(),
      };
      const provider = createTtsProvider({ provider: 'edge' }, cbs);

      await expect(provider.speak('Hello.')).rejects.toThrow('callback boom');

      expect(cbs.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'callback boom' }));
      expect(provider.isPlaying()).toBe(false);
      // onAllDone should NOT have been called (onSentenceEnd threw first)
      expect(cbs.onAllDone).not.toHaveBeenCalled();
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
    it('speak with valid key succeeds and calls callbacks', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: 'key1', voiceId: 'v1' },
        cbs,
      );

      await provider.speak('Hello.');

      expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
      expect(cbs.onError).not.toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('speak without apiKey throws', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'elevenlabs', apiKey: '', voiceId: 'v1' },
        cbs,
      );

      await expect(provider.speak('Hello.')).rejects.toThrow('ElevenLabs API key is required.');
      expect(cbs.onError).not.toHaveBeenCalled();
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
    it('speak with valid key succeeds and calls callbacks', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'openai', apiKey: 'key1' },
        cbs,
      );

      await provider.speak('Hello.');

      expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
      expect(cbs.onError).not.toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    it('speak without apiKey throws', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'openai', apiKey: '' },
        cbs,
      );

      await expect(provider.speak('Hello.')).rejects.toThrow('OpenAI API key is required for TTS.');
      expect(cbs.onError).not.toHaveBeenCalled();
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
    it('speak with valid key succeeds and calls callbacks', async () => {
      const cbs = makeCbs();
      const provider = createTtsProvider(
        { provider: 'minimax', apiKey: 'key1', voiceId: 'default' },
        cbs,
      );

      await provider.speak('Hello.');

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

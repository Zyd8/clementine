import { createAsrProvider, type AsrProvider, type AsrResult } from '@/voice/asr';

/**
 * A fake ASR provider for testing. Returns pre-scripted transcripts with
 * controllable timing — no real audio hardware.
 */
export function createFakeAsrProvider(
  script: string[],
): AsrProvider {
  let cancelled = false;

  return {
    start: async (cb) => {
      cancelled = false;

      // Stream partial transcripts, then the final.
      for (let i = 0; i < script.length; i++) {
        if (cancelled) break;
        const isLast = i === script.length - 1;
        cb({ transcript: script[i]!, isPartial: !isLast });
      }
    },

    stop: async () => {
      if (cancelled) return '';
      return script.join(' ');
    },

    cancel: async () => {
      cancelled = true;
    },
  };
}

describe('ASR provider interface', () => {
  describe('createAsrProvider', () => {
    it('returns a whisper_cpp provider for free default (no key)', () => {
      const provider = createAsrProvider({ provider: 'whisper_cpp' });
      expect(provider).toBeDefined();
      expect(typeof provider.start).toBe('function');
      expect(typeof provider.stop).toBe('function');
      expect(typeof provider.cancel).toBe('function');
    });

    it('returns a groq provider when groq is selected', () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k1' });
      expect(provider).toBeDefined();
    });

    it('returns a deepgram provider when deepgram is selected', () => {
      const provider = createAsrProvider({ provider: 'deepgram', apiKey: 'k1' });
      expect(provider).toBeDefined();
    });

    it('returns an openai provider when openai is selected', () => {
      const provider = createAsrProvider({ provider: 'openai', apiKey: 'k1' });
      expect(provider).toBeDefined();
    });
  });

  // ---- whisper_cpp provider methods ----

  describe('whisper_cpp provider', () => {
    it('start initializes without error', async () => {
      const provider = createAsrProvider({ provider: 'whisper_cpp' });
      const onT = jest.fn();
      await expect(provider.start(onT)).resolves.toBeUndefined();
    });

    it('stop returns empty string (stub)', async () => {
      const provider = createAsrProvider({ provider: 'whisper_cpp' });
      const result = await provider.stop();
      expect(result).toBe('');
    });

    it('cancel resets state', async () => {
      const provider = createAsrProvider({ provider: 'whisper_cpp' });
      await provider.cancel();
      // stop after cancel returns empty
      const result = await provider.stop();
      expect(result).toBe('');
    });
  });

  // ---- Groq provider methods ----

  describe('Groq Whisper provider', () => {
    it('start with valid key does not throw', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'key1' });
      const onT = jest.fn();
      await expect(provider.start(onT)).resolves.toBeUndefined();
    });

    it('start without apiKey throws', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: '' });
      const onT = jest.fn();
      await expect(provider.start(onT)).rejects.toThrow('Groq API key is required for Groq Whisper ASR.');
    });

    it('stop does not throw', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'key1' });
      const result = await provider.stop();
      expect(result).toBe('');
    });

    it('cancel does not throw', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'key1' });
      await expect(provider.cancel()).resolves.toBeUndefined();
    });
  });

  // ---- Deepgram provider methods ----

  describe('Deepgram provider', () => {
    it('start with valid key does not throw', async () => {
      const provider = createAsrProvider({ provider: 'deepgram', apiKey: 'key1' });
      await expect(provider.start(jest.fn())).resolves.toBeUndefined();
    });

    it('start without apiKey throws', async () => {
      const provider = createAsrProvider({ provider: 'deepgram', apiKey: '' });
      await expect(provider.start(jest.fn())).rejects.toThrow('Deepgram API key is required.');
    });

    it('stop does not throw', async () => {
      const provider = createAsrProvider({ provider: 'deepgram', apiKey: 'key1' });
      const result = await provider.stop();
      expect(result).toBe('');
    });

    it('cancel does not throw', async () => {
      const provider = createAsrProvider({ provider: 'deepgram', apiKey: 'key1' });
      await expect(provider.cancel()).resolves.toBeUndefined();
    });
  });

  // ---- OpenAI ASR provider methods ----

  describe('OpenAI ASR provider', () => {
    it('start with valid key does not throw', async () => {
      const provider = createAsrProvider({ provider: 'openai', apiKey: 'key1' });
      await expect(provider.start(jest.fn())).resolves.toBeUndefined();
    });

    it('start without apiKey throws', async () => {
      const provider = createAsrProvider({ provider: 'openai', apiKey: '' });
      await expect(provider.start(jest.fn())).rejects.toThrow('OpenAI API key is required for OpenAI Whisper ASR.');
    });

    it('stop returns empty string', async () => {
      const provider = createAsrProvider({ provider: 'openai', apiKey: 'key1' });
      const result = await provider.stop();
      expect(result).toBe('');
    });

    it('cancel resolves', async () => {
      const provider = createAsrProvider({ provider: 'openai', apiKey: 'key1' });
      await expect(provider.cancel()).resolves.toBeUndefined();
    });
  });

  // ---- Fake ASR provider (test harness for useVoiceChat) ----

  describe('fake ASR provider (test harness)', () => {
    it('streams partial transcripts then the final', async () => {
      const transcripts: AsrResult[] = [];
      const provider = createFakeAsrProvider(['Hello', 'world.', '']);

      await provider.start((r) => transcripts.push(r));

      expect(transcripts).toEqual([
        { transcript: 'Hello', isPartial: true },
        { transcript: 'world.', isPartial: true },
        { transcript: '', isPartial: false },
      ]);
    });

    it('returns the joined transcript on stop', async () => {
      const provider = createFakeAsrProvider(['Hello', 'world']);

      await provider.start(() => {});
      const final = await provider.stop();

      expect(final).toBe('Hello world');
    });

    it('cancel discards the transcript', async () => {
      const provider = createFakeAsrProvider(['Hello', 'world']);

      // Start but cancel before the second chunk
      const promise = provider.start((r) => {
        if (r.isPartial && r.transcript === 'Hello') {
          // Cancel mid-stream
          void provider.cancel();
        }
      });

      await promise;
      const final = await provider.stop();
      expect(final).toBe('');
    });

    it('stop after cancel returns empty string', async () => {
      const provider = createFakeAsrProvider(['Test']);
      await provider.start(() => {});
      await provider.cancel();

      const result = await provider.stop();
      expect(result).toBe('');
    });
  });
});

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
    it('returns a groq provider by default', () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' });
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

  // ---- provider methods ----

  // ---- Groq provider methods ----

  describe('Groq Whisper provider — the real transcription path', () => {
    const recorder = () => ({
      requestPermission: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue('file:///clip.m4a'),
      cancel: jest.fn().mockResolvedValue(undefined),
      level: jest.fn().mockReturnValue(0),
    });

    const respond = (body: unknown, ok = true, status = 200) => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    };

    afterEach(() => jest.restoreAllMocks());

    it('asks for the mic and opens it', async () => {
      const mic = recorder();
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);

      await provider.start(jest.fn());
      expect(mic.requestPermission).toHaveBeenCalled();
      expect(mic.start).toHaveBeenCalled();
    });

    it('refuses to record when the user denies the mic', async () => {
      const mic = recorder();
      mic.requestPermission.mockResolvedValue(false);
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);

      await expect(provider.start(jest.fn())).rejects.toThrow(/permission/i);
      expect(mic.start).not.toHaveBeenCalled();
    });

    it('refuses to start without a key, and says where to add one', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: '' }, recorder());
      await expect(provider.start(jest.fn())).rejects.toThrow(/Settings/);
    });

    it('uploads the clip and returns the transcript', async () => {
      const fetchMock = respond({ text: '  check the api server  ' });
      const mic = recorder();
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);
      const onTranscript = jest.fn();

      await provider.start(onTranscript);
      await expect(provider.stop()).resolves.toBe('check the api server');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api.groq.com');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
      expect(onTranscript).toHaveBeenCalledWith({
        transcript: 'check the api server',
        isPartial: false,
      });
    });

    /**
     * The clip has to arrive as something that can hand over its bytes.
     *
     * Expo's fetch replaced React Native's, and it builds the multipart body
     * in JS: `convertFormDataAsync` accepts a string, a Blob, or anything with
     * `bytes()`, and throws "Unsupported FormDataPart implementation" on
     * anything else. React Native's `{ uri, name, type }` file descriptor is
     * exactly that "anything else" — it was never read, so the mic recorded a
     * clip and the upload died on the phone before a request was made.
     *
     * Mocking `fetch` is what hid this: the failure lives in the body encoder,
     * which a mocked fetch never reaches. So assert the part's shape here.
     *
     * Read back off `append` rather than out of the FormData, because the
     * global FormData under Jest is Node's — it stringifies any part that is
     * not a Blob, so the object we passed would not survive to be inspected.
     * On device it is React Native's, which stores the part untouched.
     */
    it('sends the clip as a readable file part, not a bare uri', async () => {
      respond({ text: 'ok' });
      const mic = recorder();
      const appended = jest.spyOn(FormData.prototype, 'append');
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);

      await provider.start(jest.fn());
      await provider.stop();

      const part = appended.mock.calls.find(([field]) => field === 'file')?.[1] as unknown as {
        uri?: string;
        name?: string;
        type?: string;
        bytes?: () => Promise<Uint8Array>;
      };
      expect(part).toBeDefined();

      // The three things convertFormDataAsync reads off the part.
      expect(typeof part.bytes).toBe('function');
      expect(await part.bytes!()).toBeInstanceOf(Uint8Array);
      expect(part.name).toMatch(/\.m4a$/);
      expect(part.type).toContain('audio');
      // And it must still be the clip the recorder just wrote.
      expect(part.uri).toBe('file:///clip.m4a');
    });

    /**
     * 401 is a bad key and 429 is the daily cap. Both are the user's to fix,
     * so the status has to survive into the message rather than becoming a
     * generic failure.
     */
    it('reports the status when the request is rejected', async () => {
      respond({ error: 'invalid_api_key' }, false, 401);
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'bad' }, recorder());

      await provider.start(jest.fn());
      await expect(provider.stop()).rejects.toThrow(/401/);
    });

    it('yields nothing when the recorder captured no clip', async () => {
      const mic = recorder();
      mic.stop.mockResolvedValue(null);
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);

      await provider.start(jest.fn());
      await expect(provider.stop()).resolves.toBe('');
    });

    it('discards the recording on cancel and uploads nothing', async () => {
      const fetchMock = respond({ text: 'unused' });
      const mic = recorder();
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' }, mic);

      await provider.start(jest.fn());
      await provider.cancel();
      expect(mic.cancel).toHaveBeenCalled();
      await expect(provider.stop()).resolves.toBe('');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('says so when constructed without a recorder', async () => {
      const provider = createAsrProvider({ provider: 'groq', apiKey: 'k' });
      await expect(provider.start(jest.fn())).rejects.toThrow(/recorder/i);
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

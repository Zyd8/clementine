import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system';

import {
  createMiniMaxTtsProvider,
  DEFAULT_MINIMAX_VOICE,
  hexToBytes,
  MINIMAX_T2A_URL,
} from './minimaxTts';

/** The in-memory expo-file-system stand-in records every clip written. */
const fileTracking = () =>
  (FileSystem as unknown as {
    __tracking: { writes: { uri: string; content: string | Uint8Array }[] };
  }).__tracking;

const makeCbs = () => ({
  onSentenceEnd: jest.fn(),
  onAllDone: jest.fn(),
  onError: jest.fn(),
});

/** A successful t2a_v2 body: hex audio in data.audio, status_code 0. */
const okResponse = (hex = '01020304') => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: { audio: hex, status: 2 },
    base_resp: { status_code: 0, status_msg: 'success' },
  }),
  text: async () => '',
});

const respond = (value: unknown) => {
  const fetchMock = jest.fn().mockResolvedValue(value);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

beforeEach(() => {
  (createAudioPlayer as jest.Mock).mockClear();
  fileTracking().writes.length = 0;
});

afterEach(() => jest.restoreAllMocks());

describe('hexToBytes', () => {
  it('decodes the hex string MiniMax returns', () => {
    expect(Array.from(hexToBytes('00010aff'))).toEqual([0, 1, 10, 255]);
  });

  it('accepts uppercase hex', () => {
    expect(Array.from(hexToBytes('0AFF'))).toEqual([10, 255]);
  });

  it('is empty for an empty string', () => {
    expect(hexToBytes('')).toHaveLength(0);
  });

  /**
   * A truncated response would otherwise decode to a NaN-filled buffer and be
   * written out as a corrupt mp3 that plays as silence — the exact failure
   * this whole change exists to remove.
   */
  it('rejects an odd-length string rather than emitting garbage', () => {
    expect(() => hexToBytes('abc')).toThrow(/hex/i);
  });

  it('rejects non-hex characters', () => {
    expect(() => hexToBytes('zzzz')).toThrow(/hex/i);
  });
});

describe('createMiniMaxTtsProvider', () => {
  it('posts the sentence and plays the audio it gets back', async () => {
    const fetchMock = respond(okResponse());
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('mm_key', 'Wise_Woman', cbs);

    await provider.speak('Hello there.');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MINIMAX_T2A_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer mm_key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.text).toBe('Hello there.');
    expect(body.stream).toBe(false);
    expect(body.output_format).toBe('hex');
    expect(body.voice_setting.voice_id).toBe('Wise_Woman');
    expect(body.audio_setting.format).toBe('mp3');

    // It actually played, and only then reported the sentence spoken.
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
    expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
    expect(cbs.onError).not.toHaveBeenCalled();
    expect(provider.isPlaying()).toBe(false);
  });

  /**
   * The regression this guards: `isPlaying()` used to defer entirely to the
   * audio player, which stays false for the whole synthesis round trip — the
   * fetch to MiniMax and its response. A caller polling `isPlaying()` right
   * after `speak()` (to decide whether a reply just finished) saw false
   * during that gap and could act as if nothing was queued, even though a
   * sentence was in flight and about to play.
   */
  it('reports isPlaying true while a sentence is queued but not yet audible', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    ) as unknown as typeof fetch;
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('mm_key', 'Wise_Woman', cbs);

    const speakPromise = provider.speak('Hello there.');
    // Still mid round-trip — the fetch hasn't resolved, nothing handed to
    // the player yet — but the sentence is genuinely in flight.
    await Promise.resolve();
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(provider.isPlaying()).toBe(true);

    resolveFetch(okResponse());
    await speakPromise;

    expect(provider.isPlaying()).toBe(false);
  });

  it('falls back to a default voice when none is configured', async () => {
    const fetchMock = respond(okResponse());
    const provider = createMiniMaxTtsProvider('mm_key', '', makeCbs());

    await provider.speak('Hi.');

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.voice_setting.voice_id).toBe(DEFAULT_MINIMAX_VOICE);
  });

  it('refuses to speak without a key', async () => {
    const provider = createMiniMaxTtsProvider('', 'v', makeCbs());
    await expect(provider.speak('Hello.')).rejects.toThrow(/MiniMax API key/);
  });

  /**
   * The bug this replaces: the provider fired onAllDone without synthesizing
   * anything, so a reply was reported complete while the phone stayed silent.
   * Nothing may claim a sentence was spoken unless audio actually played.
   */
  it('never reports a sentence spoken when synthesis fails', async () => {
    respond({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized',
    });
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('bad_key', 'v', cbs);

    await expect(provider.speak('Hello.')).rejects.toThrow(/401/);

    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(cbs.onSentenceEnd).not.toHaveBeenCalled();
    expect(cbs.onAllDone).not.toHaveBeenCalled();
    expect(cbs.onError).toHaveBeenCalled();
  });

  /**
   * MiniMax answers 200 with a non-zero base_resp.status_code for a bad key,
   * an exhausted balance, or a rejected voice. Reading only response.ok would
   * take that for success and play nothing.
   */
  it('treats a non-zero base_resp status as a failure, despite HTTP 200', async () => {
    respond({
      ok: true,
      status: 200,
      json: async () => ({
        data: {},
        base_resp: { status_code: 1004, status_msg: 'insufficient balance' },
      }),
      text: async () => '',
    });
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('mm_key', 'v', cbs);

    await expect(provider.speak('Hello.')).rejects.toThrow(/insufficient balance/);
    expect(cbs.onAllDone).not.toHaveBeenCalled();
    expect(cbs.onError).toHaveBeenCalled();
  });

  it('fails loudly when the response carries no audio', async () => {
    respond({
      ok: true,
      status: 200,
      json: async () => ({ data: { audio: '' }, base_resp: { status_code: 0 } }),
      text: async () => '',
    });
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('mm_key', 'v', cbs);

    await expect(provider.speak('Hello.')).rejects.toThrow(/no audio/i);
    expect(cbs.onAllDone).not.toHaveBeenCalled();
  });

  it('ignores an empty sentence without calling the API', async () => {
    const fetchMock = respond(okResponse());
    const provider = createMiniMaxTtsProvider('mm_key', 'v', makeCbs());

    await provider.speak('   ');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** onAllDone belongs to the LAST sentence, not the first to finish. */
  it('reports all done once, after the final queued sentence', async () => {
    respond(okResponse());
    const cbs = makeCbs();
    const provider = createMiniMaxTtsProvider('mm_key', 'v', cbs);

    await Promise.all([provider.speak('One.'), provider.speak('Two.')]);

    expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(2);
    expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
  });

  it('stops playback and speaks nothing further after stop', async () => {
    const fetchMock = respond(okResponse());
    const provider = createMiniMaxTtsProvider('mm_key', 'v', makeCbs());

    await provider.stop();
    await provider.speak('Hello.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.isPlaying()).toBe(false);
  });

  it('destroy leaves nothing playing', () => {
    const provider = createMiniMaxTtsProvider('mm_key', 'v', makeCbs());
    provider.destroy();
    expect(provider.isPlaying()).toBe(false);
  });
});

/**
 * Sentences are spoken fire-and-forget as the reply streams in, so a
 * three-sentence answer used to reach the audio player three times over and
 * be heard as overlapping voices. Only one clip may be in the air at a time.
 */
describe('createMiniMaxTtsProvider — one voice at a time', () => {
  const hexFor = (n: number) => n.toString(16).padStart(2, '0');

  /** Resolves each synthesis in reverse order, so slow sentence 1 lands last. */
  const respondOutOfOrder = () => {
    const pending: (() => void)[] = [];
    global.fetch = jest.fn().mockImplementation((_url, init) => {
      const text = JSON.parse((init as RequestInit).body as string).text as string;
      const n = Number(text.replace(/\D/g, ''));
      return new Promise((resolve) => {
        pending.push(() =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: { audio: hexFor(n), status: 2 },
              base_resp: { status_code: 0 },
            }),
            text: async () => '',
          }),
        );
      });
    }) as unknown as typeof fetch;
    return pending;
  };

  it('never has two clips playing at once', async () => {
    respond(okResponse());
    const provider = createMiniMaxTtsProvider('mm_key', 'v', makeCbs());

    let concurrent = 0;
    let peak = 0;
    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const listeners: ((status: unknown) => void)[] = [];
      return {
        addListener: (_e: string, cb: (status: unknown) => void) => {
          listeners.push(cb);
          return { remove: jest.fn() };
        },
        play: () => {
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          setImmediate(() => {
            concurrent -= 1;
            for (const cb of listeners) cb({ didJustFinish: true });
          });
        },
        pause: jest.fn(),
        remove: jest.fn(),
      };
    });

    await Promise.all([
      provider.speak('One.'),
      provider.speak('Two.'),
      provider.speak('Three.'),
    ]);

    expect(peak).toBe(1);
  });

  it('speaks sentences in the order they arrived, not the order they synthesized', async () => {
    const pending = respondOutOfOrder();
    const provider = createMiniMaxTtsProvider('mm_key', 'v', makeCbs());

    (createAudioPlayer as jest.Mock).mockImplementation(() => {
      const listeners: ((status: unknown) => void)[] = [];
      return {
        addListener: (_e: string, cb: (status: unknown) => void) => {
          listeners.push(cb);
          return { remove: jest.fn() };
        },
        play: () =>
          setImmediate(() => listeners.forEach((cb) => cb({ didJustFinish: true }))),
        pause: jest.fn(),
        remove: jest.fn(),
      };
    });

    const all = Promise.all([
      provider.speak('Sentence 1.'),
      provider.speak('Sentence 2.'),
      provider.speak('Sentence 3.'),
    ]);

    // Let all three requests be issued, then answer them back-to-front so the
    // last sentence has its audio long before the first one does.
    await new Promise((r) => setImmediate(r));
    for (const resolve of [...pending].reverse()) resolve();
    await all;

    // Each sentence's clip holds its own number, so the order the files were
    // handed to the player is the order they were spoken in.
    const written = fileTracking().writes;
    const spoken = (createAudioPlayer as jest.Mock).mock.calls.map(([uri]) => {
      const clip = written.find((w) => w.uri === uri);
      return (clip?.content as Uint8Array)[0];
    });

    expect(spoken).toEqual([1, 2, 3]);
  });
});

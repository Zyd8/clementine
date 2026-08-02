import { createAudioPlayer } from 'expo-audio';

import type { TtsCallbacks } from './tts';
import {
  createEdgeTtsProvider,
  generateSecMsGec,
  parseEdgeAudioFrame,
} from './edgeTts';

/**
 * A controllable fake WebSocket. The provider drives it like the real one:
 * send() captures the frames it emits; the test triggers onopen/onmessage/
 * onclose to simulate the server.
 */
type FakeSocket = {
  sent: string[];
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onclose: (() => void) | null;
  closed: boolean;
  send: (data: string) => void;
  close: () => void;
};

const makeSocket = (): FakeSocket => {
  const s: FakeSocket = {
    sent: [],
    binaryType: '',
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    closed: false,
    send: (data: string) => {
      s.sent.push(data);
    },
    close: () => {
      s.closed = true;
    },
  };
  return s;
};

/** A valid audio frame: 2-byte big-endian header length + headers + payload. */
const audioFrame = (payload: Uint8Array): ArrayBuffer => {
  const headers = new TextEncoder().encode('Path:audio\r\nContent-Type:audio/mpeg\r\n\r\n');
  const out = new Uint8Array(2 + headers.length + payload.length);
  out[0] = (headers.length >> 8) & 0xff;
  out[1] = headers.length & 0xff;
  out.set(headers, 2);
  out.set(payload, 2 + headers.length);
  return out.buffer;
};

const makeCbs = (): jest.Mocked<TtsCallbacks> => ({
  onSentenceEnd: jest.fn(),
  onAllDone: jest.fn(),
  onError: jest.fn(),
});

/** Let the provider's async init (token → socket creation) settle. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('edgeTts', () => {
  describe('generateSecMsGec', () => {
    it('produces a 64-char uppercase hex token', async () => {
      const token = await generateSecMsGec(1_750_000_000_000);
      expect(token).toMatch(/^[0-9A-F]{64}$/);
    });

    it('is stable for the same timestamp (rounds to 5-minute windows)', async () => {
      const a = await generateSecMsGec(1_750_000_000_000);
      const b = await generateSecMsGec(1_750_000_000_001);
      expect(a).toBe(b);
    });
  });

  describe('parseEdgeAudioFrame', () => {
    it('extracts the audio payload from a binary frame', () => {
      const payload = new Uint8Array([0x49, 0x44, 0x33, 0x01]);
      const frame = audioFrame(payload);
      const audio = parseEdgeAudioFrame(frame);
      expect(audio).not.toBeNull();
      expect(Array.from(audio!)).toEqual([0x49, 0x44, 0x33, 0x01]);
    });

    it('returns null for non-audio frames', () => {
      const headers = new TextEncoder().encode('Path:turn.start\r\n\r\n');
      const out = new Uint8Array(2 + headers.length);
      out[0] = (headers.length >> 8) & 0xff;
      out[1] = headers.length & 0xff;
      out.set(headers, 2);
      expect(parseEdgeAudioFrame(out.buffer)).toBeNull();
    });

    it('returns null for a truncated frame', () => {
      expect(parseEdgeAudioFrame(new ArrayBuffer(1))).toBeNull();
    });
  });

  describe('createEdgeTtsProvider', () => {
    it('sends speech.config then ssml, plays the received mp3, and completes', async () => {
      const cbs = makeCbs();
      const socket = makeSocket();
      const provider = createEdgeTtsProvider(cbs, 'en-US-AriaNeural', {
        wsFactory: () => socket,
      });

      const playPromise = provider.speak('Hello there.');
      await flush();
      expect(socket.sent).toEqual([]);

      socket.onopen?.();
      // speech.config + ssml frames were sent
      expect(socket.sent[0]).toContain('Path:speech.config');
      expect(socket.sent[1]).toContain('Path:ssml');
      expect(socket.sent[1]).toContain('en-US-AriaNeural');
      expect(socket.sent[1]).toContain('Hello there.');

      // Server streams two audio frames then ends the turn.
      socket.onmessage?.({ data: 'X-RequestId:x\r\nPath:turn.start\r\n\r\n' });
      socket.onmessage?.({ data: audioFrame(new Uint8Array([1, 2, 3])) });
      socket.onmessage?.({ data: audioFrame(new Uint8Array([4, 5, 6])) });
      socket.onmessage?.({ data: 'X-RequestId:x\r\nPath:turn.end\r\n\r\n' });
      socket.onclose?.();

      await playPromise;

      // The mp3 was written and handed to the audio player.
      expect(createAudioPlayer).toHaveBeenCalled();
      const player = (createAudioPlayer as jest.Mock).mock.results[0]?.value;
      expect(player.play).toHaveBeenCalled();
      // Playback completion drives the callbacks.
      expect(cbs.onSentenceEnd).toHaveBeenCalledTimes(1);
      expect(cbs.onAllDone).toHaveBeenCalledTimes(1);
      expect(cbs.onError).not.toHaveBeenCalled();
      expect(provider.isPlaying()).toBe(false);
    });

    /**
     * The regression this guards: `isPlaying()` used to defer entirely to
     * the audio player, which stays false for the whole WSS round trip —
     * connect, send SSML, wait for frames. A caller polling `isPlaying()`
     * right after `speak()` (to decide whether a reply just finished) saw
     * false during that gap and could act as if nothing was queued, even
     * though a sentence was on its way and about to play.
     */
    it('reports isPlaying true while a sentence is queued but not yet audible', async () => {
      const cbs = makeCbs();
      const socket = makeSocket();
      const provider = createEdgeTtsProvider(cbs, 'en-US-AriaNeural', {
        wsFactory: () => socket,
      });

      const playPromise = provider.speak('Hello there.');
      await flush();

      // Still mid round-trip — no frames received yet — but the sentence
      // is genuinely in flight.
      expect(provider.isPlaying()).toBe(true);

      socket.onopen?.();
      socket.onmessage?.({ data: 'X-RequestId:x\r\nPath:turn.start\r\n\r\n' });
      socket.onmessage?.({ data: audioFrame(new Uint8Array([1, 2, 3])) });
      socket.onmessage?.({ data: 'X-RequestId:x\r\nPath:turn.end\r\n\r\n' });
      socket.onclose?.();
      await playPromise;

      expect(provider.isPlaying()).toBe(false);
    });

    it('rejects and reports onError when the turn ends with no audio', async () => {
      const cbs = makeCbs();
      const socket = makeSocket();
      const provider = createEdgeTtsProvider(cbs, undefined, {
        wsFactory: () => socket,
      });

      const playPromise = provider.speak('Hello there.');
      await flush();
      socket.onopen?.();
      socket.onmessage?.({ data: 'X-RequestId:x\r\nPath:turn.end\r\n\r\n' });
      socket.onclose?.();

      await expect(playPromise).rejects.toThrow(/no audio/i);
      expect(cbs.onError).toHaveBeenCalled();
      expect(cbs.onAllDone).not.toHaveBeenCalled();
    });

    it('routes a socket error to onError and rejects', async () => {
      const cbs = makeCbs();
      const socket = makeSocket();
      const provider = createEdgeTtsProvider(cbs, undefined, {
        wsFactory: () => socket,
      });

      const playPromise = provider.speak('Hello there.');
      await flush();
      socket.onopen?.();
      socket.onerror?.({ message: 'boom' });

      await expect(playPromise).rejects.toThrow('boom');
      expect(cbs.onError).toHaveBeenCalled();
    });

    it('stop closes the socket and refuses further playback', async () => {
      const cbs = makeCbs();
      const socket = makeSocket();
      const provider = createEdgeTtsProvider(cbs, undefined, {
        wsFactory: () => socket,
      });

      const playPromise = provider.speak('Hello there.');
      await flush();
      socket.onopen?.();
      await provider.stop();
      expect(socket.closed).toBe(true);

      // The in-flight sentence resolves quietly after a stop (no error spam).
      socket.onclose?.();
      await expect(playPromise).resolves.toBeUndefined();
      expect(cbs.onError).not.toHaveBeenCalled();
    });
  });
});

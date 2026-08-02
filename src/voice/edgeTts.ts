import * as Crypto from 'expo-crypto';
import * as Sentry from '@sentry/react-native';

import { createMp3Playback } from './audioPlayback';
import { createSpeechOrder, type SpeechTurn } from './speechOrder';
import type { TtsCallbacks, TtsProvider } from './tts';

/**
 * Real Edge TTS provider (Microsoft's free, unofficial readaloud endpoint).
 *
 * The previous implementation was a stub — it fired callbacks and played
 * nothing, so voice mode "replied" in total silence. This speaks for real:
 *   1. Generate a `Sec-MS-GEC` DRM token (Windows-file-time ticks rounded to
 *      5 minutes, SHA-256, uppercase hex) — the same algorithm the edge-tts
 *      project uses, verified live against the endpoint.
 *   2. Open the readaloud WSS with Chrome browser headers + a muid cookie.
 *   3. Send `speech.config` then the sentence as SSML.
 *   4. Collect the binary MP3 frames the server streams back.
 *   5. Write the MP3 to the cache directory and play it via `createAudioPlayer`.
 *
 * Edge is an unofficial endpoint: it can 403, rate-limit, or change its
 * token scheme without notice. Failures are reported to Sentry AND surfaced
 * through `onError` so the app never silently plays nothing.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0]!;
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
/** Windows file-time epoch offset from Unix (1601-01-01 → 1970-01-01). */
const WIN_EPOCH_SECONDS = 11_644_473_600;
/** The endpoint's supported voices — the user's voiceId wins when set. */
export const DEFAULT_EDGE_VOICE = 'en-US-AriaNeural';
/** Cache files are mp3; keep them together so a stale one is obvious. */
const EDGE_AUDIO_DIR = 'edge-tts';

// ---- Pure helpers (unit-tested directly) ----

/**
 * Sec-MS-GEC token. `ticks` = unix seconds → Windows file time (add the
 * 1601 epoch), rounded DOWN to the nearest 5 minutes, converted to
 * 100-nanosecond intervals. Hash `"{ticks}{clientToken}"` with SHA-256 and
 * uppercase the hex — the edge-tts algorithm, verified live.
 */
export async function generateSecMsGec(nowMs: number = Date.now()): Promise<string> {
  let ticks = nowMs / 1000;
  ticks += WIN_EPOCH_SECONDS;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100; // seconds → 100ns Windows file-time intervals
  const toHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, toHash);
  return digest.toUpperCase();
}

/** JavaScript-style date string the endpoint expects in X-Timestamp. */
export function edgeDateString(now: Date = new Date()): string {
  return now
    .toUTCString()
    .replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}

/**
 * Parse one binary frame from the readaloud WSS.
 * Format: 2-byte big-endian header length, header text, then audio bytes.
 * Returns the audio payload, or null for non-audio frames.
 */
export function parseEdgeAudioFrame(buffer: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2) return null;
  const headerLen = (bytes[0]! << 8) | bytes[1]!;
  if (2 + headerLen > bytes.length) return null;
  const headers = new TextDecoder().decode(bytes.subarray(2, 2 + headerLen));
  if (!headers.includes('Path:audio')) return null;
  return bytes.subarray(2 + headerLen);
}

const uuidHex = (): string =>
  // crypto.randomUUID is not available on Hermes; Math.random is fine for a
  // connection id the server only uses to correlate frames.
  'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const buildSsrc = (text: string, voice: string): string =>
  `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>${text.replace(
    /[<>&]/g,
    '',
  )}</voice></speak>`;

// ---- WebSocket shim (injectable for tests) ----

type EdgeSocket = {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type EdgeSocketFactory = (url: string) => EdgeSocket;

/** RN's global WebSocket accepts a headers option; @types/node's doesn't. */
type RnWebSocketConstructor = new (
  uri: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string> } | null,
) => EdgeSocket;

/** The real browser-ish handshake Edge expects (headers + muid cookie). */
const defaultSocketFactory: EdgeSocketFactory = (url) => {
  const Ctor = WebSocket as unknown as RnWebSocketConstructor;
  return new Ctor(url, undefined, {
    headers: {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': `muid=${uuidHex().toUpperCase()};`,
    },
  });
};

// ---- The provider ----

export function createEdgeTtsProvider(
  callbacks: TtsCallbacks,
  voice: string = DEFAULT_EDGE_VOICE,
  deps: { wsFactory?: EdgeSocketFactory } = {},
): TtsProvider {
  const wsFactory: EdgeSocketFactory = deps.wsFactory ?? defaultSocketFactory;

  const playback = createMp3Playback(EDGE_AUDIO_DIR);
  // Sentences stream in and are spoken fire-and-forget, so without this they
  // would reach the player together and be heard on top of one another.
  const order = createSpeechOrder();
  let stopped = false;
  let currentSocket: EdgeSocket | null = null;
  // Sentences arrive faster than they are spoken — count outstanding ones so
  // onAllDone fires when the LAST finishes, not the first (same contract as
  // the device provider).
  let queued = 0;

  const cleanupSocket = (): void => {
    currentSocket?.close();
    currentSocket = null;
  };

  const fail = (message: string, error?: unknown): void => {
    const err = error instanceof Error ? error : new Error(message);
    Sentry.captureException(err, { tags: { reason: 'voice' } });
    callbacks.onError(err);
  };

  /**
   * One sentence through the full pipeline: WSS → collect MP3 → cache file →
   * play. Resolves when playback of THAT sentence finishes, so speak() chains
   * sentences one after another.
   */
  const speakOne = (text: string, turn: SpeechTurn): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const utterance = text.trim();
      if (!utterance) {
        resolve();
        return;
      }
      if (stopped) {
        resolve();
        return;
      }

      void (async () => {
        try {
          const secMsGec = await generateSecMsGec();
          const url =
            `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
            `&ConnectionId=${uuidHex()}` +
            `&Sec-MS-GEC=${secMsGec}` +
            `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`;

          const socket = wsFactory(url);
          currentSocket = socket;
          const chunks: Uint8Array[] = [];
          let turnEnded = false;

          socket.binaryType = 'arraybuffer';

          socket.onopen = () => {
            if (stopped) return;
            const ts = edgeDateString();
            socket.send(
              `X-Timestamp:${ts}\r\n` +
                'Content-Type:application/json; charset=utf-8\r\n' +
                'Path:speech.config\r\n\r\n' +
                '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n',
            );
            socket.send(
              `X-RequestId:${uuidHex()}\r\n` +
                'Content-Type:application/ssml+xml\r\n' +
                `X-Timestamp:${ts}Z\r\n` +
                'Path:ssml\r\n\r\n' +
                buildSsrc(utterance, voice),
            );
          };

          socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
              if (event.data.includes('Path:turn.end')) {
                turnEnded = true;
              }
              return;
            }
            const audio = parseEdgeAudioFrame(event.data);
            if (audio) chunks.push(audio);
          };

          socket.onerror = (event) => {
            reject(new Error(event?.message ?? 'Edge TTS WebSocket error'));
          };

          socket.onclose = () => {
            if (stopped) {
              resolve();
              return;
            }
            if (!turnEnded || chunks.length === 0) {
              reject(
                new Error(
                  turnEnded
                    ? 'Edge TTS returned no audio — endpoint may have changed.'
                    : 'Edge TTS connection closed before the turn finished.',
                ),
              );
              return;
            }
            // Assemble the MP3 and write it to the cache.
            let total = 0;
            for (const chunk of chunks) total += chunk.length;
            const mp3 = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              mp3.set(chunk, offset);
              offset += chunk.length;
            }
            // Wait for every earlier sentence to finish before being heard.
            void turn.wait
              .then(() => (stopped ? undefined : playback.play(mp3)))
              .then(() => {
                if (!stopped) callbacks.onSentenceEnd();
                resolve();
              }, reject);
          };
        } catch (error) {
          reject(error);
        }
      })();
    });

  return {
    speak: async (text: string): Promise<void> => {
      if (stopped) return;
      queued += 1;
      let completed = false;
      const turn = order.take();
      try {
        await speakOne(text, turn);
        completed = true;
      } catch (error) {
        fail('Edge TTS failed', error);
        throw error;
      } finally {
        turn.release();
        queued = Math.max(0, queued - 1);
        // onAllDone only after real playback completed — a failed sentence
        // must not look like a finished reply.
        if (completed && queued === 0 && !stopped) {
          callbacks.onAllDone();
        }
      }
    },

    stop: async (): Promise<void> => {
      stopped = true;
      order.reset();
      cleanupSocket();
      playback.stop();
    },

    destroy: (): void => {
      stopped = true;
      order.reset();
      cleanupSocket();
      playback.stop();
    },

    // `playback.isPlaying()` alone is false during the WSS synthesis round
    // trip (queued but no audio yet) — the exact gap that let the caller
    // believe a reply was finished and reopen the mic while a sentence was
    // still on its way out, right before it started playing. `queued`
    // covers that gap: incremented the instant speak() accepts a sentence,
    // decremented only once it has actually played (or failed).
    isPlaying: (): boolean => queued > 0,
  };
}

import * as Sentry from '@sentry/react-native';

import { createMp3Playback } from './audioPlayback';
import { DEFAULT_MINIMAX_VOICE } from '@/constants/minimaxVoices';
import { createSpeechOrder } from './speechOrder';
import type { TtsCallbacks, TtsProvider } from './tts';

/**
 * Real MiniMax TTS provider (T2A v2).
 *
 * The previous implementation was a stub: it fired `onSentenceEnd` and
 * `onAllDone` without synthesizing anything, so voice mode reported the reply
 * complete while the phone stayed silent — the failure looked like a bug in
 * playback when in fact nothing was ever requested.
 *
 * The real flow is one HTTP call per sentence:
 *   1. POST the sentence to the T2A v2 endpoint with the user's key.
 *   2. MiniMax answers with the MP3 hex-encoded in `data.audio`.
 *   3. Decode, write to the cache, play — and only then report it spoken.
 *
 * Two failure modes have to be told apart. A bad key or a network fault comes
 * back as a non-2xx. An exhausted balance, a rejected voice, or a moderated
 * sentence comes back as **HTTP 200 with a non-zero `base_resp.status_code`** —
 * reading only `response.ok` would take that for success and play silence.
 */

/** The international endpoint. Takes no GroupId — auth is the bearer key alone. */
export const MINIMAX_T2A_URL = 'https://api.minimax.io/v1/t2a_v2';

/**
 * Turbo rather than HD: this is a spoken conversation, where the reply
 * starting sooner beats a marginally richer voice.
 */
export const MINIMAX_MODEL = 'speech-2.8-turbo';

/** The default lives with the voice list so the picker and provider cannot drift. */
export { DEFAULT_MINIMAX_VOICE };

/** Cache subdirectory, kept separate so a stale clip is traceable. */
const MINIMAX_AUDIO_DIR = 'minimax-tts';

/**
 * Decode MiniMax's hex audio payload.
 *
 * Strict on purpose. A truncated or non-hex body would otherwise decode to a
 * NaN-filled buffer, get written out as a corrupt MP3, and play as silence —
 * indistinguishable from the stub this replaces.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('MiniMax returned malformed hex audio (odd length).');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('MiniMax returned malformed hex audio (non-hex characters).');
    }
    bytes[i] = byte;
  }
  return bytes;
}

type MiniMaxResponse = {
  data?: { audio?: string; status?: number };
  base_resp?: { status_code?: number; status_msg?: string };
};

export function createMiniMaxTtsProvider(
  apiKey: string,
  voiceId: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  const playback = createMp3Playback(MINIMAX_AUDIO_DIR);
  // Sentences are handed over fire-and-forget as the reply streams, so
  // without this they would all reach the player at once and be heard on top
  // of one another. Synthesis stays parallel; only playback is ordered.
  const order = createSpeechOrder();

  let stopped = false;
  // Sentences arrive faster than they are spoken — count outstanding ones so
  // onAllDone fires when the LAST finishes, not the first (same contract as
  // the device and Edge providers).
  let queued = 0;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error(
        'MiniMax API key is required for TTS. Add it under Settings → Voice.',
      );
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  /** Fetch one sentence's MP3. Throws with a message the user can act on. */
  const synthesize = async (utterance: string): Promise<Uint8Array> => {
    const response = await fetch(MINIMAX_T2A_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        text: utterance,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: voiceId || DEFAULT_MINIMAX_VOICE,
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      }),
    });

    if (!response.ok) {
      // 401 is a bad key and 429 is the rate limit — both are the user's to
      // fix, so the status has to survive into the message.
      const detail = await response.text().catch(() => '');
      throw new Error(
        `MiniMax TTS failed (${response.status}). ${detail}`.trim(),
      );
    }

    const body = (await response.json()) as MiniMaxResponse;

    const status = body.base_resp?.status_code ?? 0;
    if (status !== 0) {
      throw new Error(
        `MiniMax TTS failed (${status}). ${body.base_resp?.status_msg ?? ''}`.trim(),
      );
    }

    const hex = body.data?.audio ?? '';
    if (!hex) {
      throw new Error('MiniMax TTS returned no audio for this sentence.');
    }

    return hexToBytes(hex);
  };

  return {
    speak: async (text: string): Promise<void> => {
      failIfNoKey();
      const utterance = text.trim();
      if (!utterance || stopped) return;

      queued += 1;
      let completed = false;
      const turn = order.take();
      try {
        const mp3 = await synthesize(utterance);
        // Wait for every earlier sentence to finish being spoken.
        await turn.wait;
        if (stopped) return;
        await playback.play(mp3);
        completed = true;
        callbacks.onSentenceEnd();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        Sentry.captureException(err, { tags: { reason: 'voice' } });
        callbacks.onError(err);
        throw err;
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
      playback.stop();
    },

    destroy: (): void => {
      stopped = true;
      order.reset();
      playback.stop();
    },

    isPlaying: (): boolean => playback.isPlaying(),
  };
}

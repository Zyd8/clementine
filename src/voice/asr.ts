import * as Sentry from '@sentry/react-native';

import type { AsrProviderConfig } from '@/types/voice';

import type { Recorder } from './recorder';

/**
 * ASR (Automatic Speech Recognition) provider interface.
 *
 * The boundary between the voice chat system and the actual speech recognition
 * backend. The default is Groq Whisper on its free tier.
 * BYO providers (Groq Whisper, Deepgram, OpenAI Whisper) are the upgrade path.
 *
 * The provider interface is deliberately abstract so tests inject fake
 * implementations and additional cloud backends plug in behind the same
 * contract.
 *
 * `groq` is implemented: it records a clip and posts it to Groq's Whisper
 * endpoint, whose free tier covers far more than one person can speak.
 * Deepgram and OpenAI remain interface-only.
 */

export type AsrResult = {
  transcript: string;
  isPartial: boolean;
};

/**
 * The ASR provider contract.
 *
 * `start()` opens the mic and begins streaming recognition. Each callback
 * fires with a partial or final transcript. `stop()` closes the mic and
 * returns the final transcript. `cancel()` discards without a transcript.
 */
export interface AsrProvider {
  /** Open the mic, start recognition. */
  start: (
    onTranscript: (result: AsrResult) => void,
  ) => Promise<void>;
  /** Stop the mic, flush the final transcript. Returns the full text. */
  stop: () => Promise<string>;
  /** Discard the recording without a result. */
  cancel: () => Promise<void>;
}

/**
 * Create the ASR provider for the given config.
 *
 * Every provider needs a recorder to capture from — transcription is a
 * network call over a clip this app records itself.
 */
export function createAsrProvider(
  config: AsrProviderConfig,
  recorder?: Recorder,
): AsrProvider {
  switch (config.provider) {
    case 'groq':
      return createGroqProvider(config.apiKey ?? '', recorder);
    case 'deepgram':
      return createDeepgramProvider(config.apiKey ?? '');
    case 'openai':
      return createOpenAiAsrProvider(config.apiKey ?? '');
  }
}

// ---- Groq Whisper ----

/** Free tier at time of writing: 2,000 requests/day, 28,800 audio seconds/day. */
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/** Turbo is several times faster than large-v3 at the same free-tier limits. */
const GROQ_MODEL = 'whisper-large-v3-turbo';

function createGroqProvider(apiKey: string, recorder?: Recorder): AsrProvider {
  let abortController: AbortController | null = null;
  let cancelled = false;
  let sink: ((result: AsrResult) => void) | null = null;

  const requireRecorder = (): Recorder => {
    if (!recorder) {
      throw new Error('Groq Whisper ASR needs a recorder to capture from.');
    }
    return recorder;
  };

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error(
        'Groq API key is required for Groq Whisper ASR. Add it under Settings → Voice.',
      );
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    start: async (onTranscript) => {
      failIfNoKey();
      cancelled = false;
      sink = onTranscript;

      const mic = requireRecorder();
      if (!(await mic.requestPermission())) {
        const err = new Error('Microphone permission denied.');
        Sentry.captureException(err, { tags: { reason: 'voice' } });
        throw err;
      }

      abortController = new AbortController();
      await mic.start();
    },

    stop: async () => {
      const mic = requireRecorder();
      const clip = await mic.stop();
      if (cancelled || !clip) return '';

      // React Native's FormData takes a file descriptor rather than a Blob;
      // the clip never has to be read into JS memory.
      const form = new FormData();
      form.append('file', {
        uri: clip,
        name: 'speech.m4a',
        type: 'audio/m4a',
      } as unknown as Blob);
      form.append('model', GROQ_MODEL);
      // The agent is driven in English and the prompt surface is English;
      // pinning it stops a noisy clip being "detected" as another language.
      form.append('language', 'en');
      form.append('response_format', 'json');

      try {
        const response = await fetch(GROQ_TRANSCRIBE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          ...(abortController ? { signal: abortController.signal } : {}),
        });

        if (!response.ok) {
          // 401 is a bad key and 429 is the daily cap — both are the user's
          // to fix, so the status has to survive into the message.
          const detail = await response.text().catch(() => '');
          throw new Error(
            `Groq transcription failed (${response.status}). ${detail}`.trim(),
          );
        }

        const body = (await response.json()) as { text?: string };
        const transcript = (body.text ?? '').trim();
        if (transcript) sink?.({ transcript, isPartial: false });
        return transcript;
      } catch (error) {
        // An abort is a deliberate cancel, not a failure worth reporting.
        if (cancelled) return '';
        Sentry.captureException(error, { tags: { reason: 'voice' } });
        throw error;
      } finally {
        abortController = null;
      }
    },

    cancel: async () => {
      cancelled = true;
      sink = null;
      abortController?.abort();
      abortController = null;
      await recorder?.cancel();
    },
  };
}

// ---- Deepgram ----

function createDeepgramProvider(apiKey: string): AsrProvider {
  let socket: Closeable | null = null;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('Deepgram API key is required.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    start: async () => {
      failIfNoKey();
    },
    stop: async () => {
      socket?.close();
      socket = null;
      return '';
    },
    cancel: async () => {
      socket?.close();
      socket = null;
    },
  };
}

// ---- OpenAI Whisper ----

function createOpenAiAsrProvider(apiKey: string): AsrProvider {
  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('OpenAI API key is required for OpenAI Whisper ASR.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    start: async () => {
      failIfNoKey();
    },
    stop: async () => '',
    cancel: async () => undefined,
  };
}

// ---- Types ----

interface Closeable {
  close: () => void;
}

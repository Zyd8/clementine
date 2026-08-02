import * as Sentry from '@sentry/react-native';
// `whisper.rn/index`, not `whisper.rn`: the package's exports map defines
// only `./*` subpaths with no `.` entry, so the bare specifier fails under
// bundler resolution. Metro resolves both; TypeScript resolves only this one.
import { initWhisper, type WhisperContext } from 'whisper.rn/index';

import type { AsrProviderConfig } from '@/types/voice';

import type { Recorder } from './recorder';
import { ensureModel } from './whisperModel';

/**
 * ASR (Automatic Speech Recognition) provider interface.
 *
 * The boundary between the voice chat system and the actual speech recognition
 * backend. Free-first: the default is on-device whisper.cpp (no key required).
 * BYO providers (Groq Whisper, Deepgram, OpenAI Whisper) are the upgrade path.
 *
 * The provider interface is deliberately abstract so tests inject fake
 * implementations and real native bindings (whisper.cpp RN, etc.) plug in
 * behind the same contract.
 *
 * `whisper_cpp` is implemented against whisper.rn and runs entirely
 * on-device: no key, no network, nothing leaves the phone. The BYO cloud
 * providers remain interface-only.
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
 * `whisper_cpp` needs a recorder to capture from; the cloud providers are
 * still interface-only and ignore it.
 */
export function createAsrProvider(
  config: AsrProviderConfig,
  recorder?: Recorder,
): AsrProvider {
  switch (config.provider) {
    case 'whisper_cpp':
      return createWhisperCppProvider(recorder);
    case 'groq':
      return createGroqProvider(config.apiKey ?? '');
    case 'deepgram':
      return createDeepgramProvider(config.apiKey ?? '');
    case 'openai':
      return createOpenAiAsrProvider(config.apiKey ?? '');
  }
}

// ---- whisper.cpp (free default, on-device) ----

/**
 * The loaded model, kept for the process lifetime.
 *
 * Initialising a context reads ~75MB off disk and costs seconds; doing it per
 * utterance would put that in front of every single turn.
 */
let sharedContext: WhisperContext | null = null;

async function whisperContext(): Promise<WhisperContext> {
  if (sharedContext) return sharedContext;
  const filePath = await ensureModel();
  sharedContext = await initWhisper({ filePath });
  return sharedContext;
}

function createWhisperCppProvider(recorder?: Recorder): AsrProvider {
  let cancelled = false;
  let sink: ((result: AsrResult) => void) | null = null;

  const requireRecorder = (): Recorder => {
    if (!recorder) {
      throw new Error('On-device whisper.cpp ASR needs a recorder to capture from.');
    }
    return recorder;
  };

  return {
    start: async (onTranscript): Promise<void> => {
      cancelled = false;
      sink = onTranscript;
      const mic = requireRecorder();

      if (!(await mic.requestPermission())) {
        const err = new Error('Microphone permission denied.');
        Sentry.captureException(err, { tags: { reason: 'voice' } });
        throw err;
      }

      // Warm the context while the user is still speaking, so the wait after
      // they stop is inference only, not a 75MB model load as well.
      void whisperContext().catch((error: unknown) => {
        Sentry.captureException(error, { tags: { reason: 'voice' } });
      });

      await mic.start();
    },

    stop: async (): Promise<string> => {
      const mic = requireRecorder();
      const clip = await mic.stop();
      if (cancelled || !clip) return '';

      try {
        const context = await whisperContext();
        // `language: 'en'` because the bundled weights are the English-only
        // build; asking it to detect would cost time for nothing.
        const { promise } = context.transcribe(clip, { language: 'en' });
        const { result } = await promise;
        const transcript = result.trim();
        if (transcript) sink?.({ transcript, isPartial: false });
        return transcript;
      } catch (error) {
        Sentry.captureException(error, { tags: { reason: 'voice' } });
        throw error;
      }
    },

    cancel: async (): Promise<void> => {
      cancelled = true;
      sink = null;
      await recorder?.cancel();
    },
  };
}

// ---- Groq Whisper ----

function createGroqProvider(apiKey: string): AsrProvider {
  let abortController: AbortController | null = null;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('Groq API key is required for Groq Whisper ASR.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    start: async (onT) => {
      failIfNoKey();
      abortController = new AbortController();
      // Real implementation: POST to Groq /openai/v1/audio/transcriptions
    },
    stop: async () => {
      abortController?.abort();
      abortController = null;
      return '';
    },
    cancel: async () => {
      abortController?.abort();
      abortController = null;
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

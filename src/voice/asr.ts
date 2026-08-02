import * as Sentry from '@sentry/react-native';

import type { AsrProviderConfig } from '@/types/voice';

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
 * NOTE: whisper.cpp native binding and streaming ASR packages
 * (react-native-whisper, react-native-deepgram, etc.) are NOT installed —
 * only the interface contract and its tests. See the final report.
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
 * Falls back to a no-op provider when the platform binding is not available.
 */
export function createAsrProvider(config: AsrProviderConfig): AsrProvider {
  switch (config.provider) {
    case 'whisper_cpp':
      return createWhisperCppProvider();
    case 'groq':
      return createGroqProvider(config.apiKey ?? '');
    case 'deepgram':
      return createDeepgramProvider(config.apiKey ?? '');
    case 'openai':
      return createOpenAiAsrProvider(config.apiKey ?? '');
  }
}

// ---- whisper.cpp (free default, on-device) ----

function createWhisperCppProvider(): AsrProvider {
  let cancelled = false;

  return {
    start: async (
      cb: (result: AsrResult) => void,
    ): Promise<void> => {
      // cb is the transcript sink. The interface contract is testable via
      // the mock; the real whisper.cpp binding (react-native-whisper) is
      // not installed, so transcripts are not produced yet.
      void cb;
      cancelled = false;
    },

    stop: async (): Promise<string> => {
      if (cancelled) return '';
      // Real implementation: stop the mic and run inference.
      // TODO: wire real whisper.cpp binding.
      return '';
    },

    cancel: async (): Promise<void> => {
      cancelled = true;
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

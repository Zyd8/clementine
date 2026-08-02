import * as Sentry from '@sentry/react-native';
import * as Speech from 'expo-speech';

import type { TtsProviderConfig } from '@/types/voice';

/**
 * TTS (Text-to-Speech) provider interface.
 *
 * Free-first default: Edge TTS (Microsoft, no key required). BYO providers
 * (ElevenLabs, OpenAI, MiniMax) are the upgrade path.
 *
 * The interface handles the full lifecycle: enqueue text → synthesize → play.
 * Sentence-chunked: the voice chat system feeds one sentence at a time
 * (via sentenceBuffer), not the full reply, so the first audio plays ~1-2s
 * after the first sentence arrives from SSE.
 *
 * NOTE: Edge TTS is an unofficial endpoint and can break/rate-limit without
 * notice. The app must NOT silently swallow TTS failures — it should either
 * fall back to text-only display or surface an error toast. This module
 * reports failures to Sentry.
 *
 * `device` is implemented against expo-speech. The cloud providers below
 * remain interface-only — the interface
 * contract is testable via mocks. Real audio playback requires these packages.
 */

export type TtsCallbacks = {
  /** Called when a sentence finishes playing. */
  onSentenceEnd: () => void;
  /** Called when all queued sentences are done. */
  onAllDone: () => void;
  /** Called on error. */
  onError: (error: Error) => void;
};

export interface TtsProvider {
  /** Synthesize and play one sentence. Returns a promise that resolves when playback starts. */
  speak: (text: string) => Promise<void>;
  /** Stop playback immediately. */
  stop: () => Promise<void>;
  /** Clean up resources. */
  destroy: () => void;
  /** Whether audio is currently playing. */
  isPlaying: () => boolean;
}

/**
 * Create a TTS provider for the given config.
 */
export function createTtsProvider(
  config: TtsProviderConfig,
  callbacks: TtsCallbacks,
): TtsProvider {
  switch (config.provider) {
    case 'device':
      return createDeviceTtsProvider(callbacks);
    case 'edge':
      return createEdgeTtsProvider(callbacks);
    case 'elevenlabs':
      return createElevenLabsTtsProvider(config.apiKey ?? '', config.voiceId ?? '', callbacks);
    case 'openai':
      return createOpenAiTtsProvider(config.apiKey ?? '', config.voiceId ?? '', callbacks);
    case 'minimax':
      return createMiniMaxTtsProvider(config.apiKey ?? '', config.voiceId ?? '', callbacks);
  }
}

// ---- Device TTS (free default, on-device) ----

/**
 * The platform's own speech engine.
 *
 * Free, offline, no key, and it matches the ASR story: nothing about a voice
 * turn leaves the phone. Every sentence the agent streams is queued here as
 * `sentenceBuffer` closes it, so playback starts before the reply is finished
 * rather than after.
 */
function createDeviceTtsProvider(callbacks: TtsCallbacks): TtsProvider {
  let playing = false;
  // Sentences arrive faster than they are spoken, so track how many are still
  // outstanding — `onAllDone` must fire when the last one ends, not the first.
  let queued = 0;
  let stopped = false;

  return {
    speak: async (text: string): Promise<void> => {
      const utterance = text.trim();
      if (!utterance) return;

      stopped = false;
      playing = true;
      queued += 1;

      const finish = () => {
        queued = Math.max(0, queued - 1);
        callbacks.onSentenceEnd();
        if (queued === 0) {
          playing = false;
          if (!stopped) callbacks.onAllDone();
        }
      };

      Speech.speak(utterance, {
        onDone: finish,
        onStopped: () => {
          // A stop empties the whole queue at once; unwinding it one
          // callback at a time would fire onAllDone early.
          queued = 0;
          playing = false;
        },
        onError: (error: Error) => {
          queued = Math.max(0, queued - 1);
          if (queued === 0) playing = false;
          Sentry.captureException(error, { tags: { reason: 'voice' } });
          callbacks.onError(error);
        },
      });
    },

    stop: async (): Promise<void> => {
      stopped = true;
      queued = 0;
      playing = false;
      await Speech.stop();
    },

    destroy: (): void => {
      stopped = true;
      queued = 0;
      playing = false;
      void Speech.stop();
    },

    isPlaying: (): boolean => playing,
  };
}

// ---- Edge TTS (free default) ----

function createEdgeTtsProvider(callbacks: TtsCallbacks): TtsProvider {
  let playing = false;
  let stopped = false;

  return {
    speak: async (text: string): Promise<void> => {
      stopped = false;
      playing = true;

      // Real implementation: POST to Edge TTS endpoint, stream audio, play via expo-av.
      // Edge TTS is an unofficial endpoint — it can break or rate-limit.
      // On failure, report to Sentry and surface the error rather than silently dropping.
      try {
        // TODO: wire real Edge TTS when expo-av/expo-audio are installed.
        // For now, simulate successful playback.
        callbacks.onSentenceEnd();
        callbacks.onAllDone();
      } catch (error) {
        playing = false;
        const err = error instanceof Error ? error : new Error(String(error));
        Sentry.captureException(err, { tags: { reason: 'voice' } });
        callbacks.onError(err);
        throw err;
      } finally {
        if (!stopped) {
          playing = false;
        }
      }
    },

    stop: async (): Promise<void> => {
      stopped = true;
      playing = false;
    },

    destroy: (): void => {
      playing = false;
    },

    isPlaying: (): boolean => playing,
  };
}

// ---- ElevenLabs ----

function createElevenLabsTtsProvider(
  apiKey: string,
  voiceId: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  let playing = false;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('ElevenLabs API key is required.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    speak: async (text: string): Promise<void> => {
      failIfNoKey();
      playing = true;
      // Real: POST to https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
      callbacks.onSentenceEnd();
      callbacks.onAllDone();
      playing = false;
    },
    stop: async () => {
      playing = false;
    },
    destroy: () => {
      playing = false;
    },
    isPlaying: () => playing,
  };
}

// ---- OpenAI TTS ----

function createOpenAiTtsProvider(
  apiKey: string,
  voiceId: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  let playing = false;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('OpenAI API key is required for TTS.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    speak: async (text: string): Promise<void> => {
      failIfNoKey();
      playing = true;
      // Real: POST to https://api.openai.com/v1/audio/speech
      callbacks.onSentenceEnd();
      callbacks.onAllDone();
      playing = false;
    },
    stop: async () => {
      playing = false;
    },
    destroy: () => {
      playing = false;
    },
    isPlaying: () => playing,
  };
}

// ---- MiniMax ----

function createMiniMaxTtsProvider(
  apiKey: string,
  voiceId: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  let playing = false;

  const failIfNoKey = (): void => {
    if (!apiKey) {
      const err = new Error('MiniMax API key is required for TTS.');
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      throw err;
    }
  };

  return {
    speak: async (text: string): Promise<void> => {
      failIfNoKey();
      playing = true;
      callbacks.onSentenceEnd();
      callbacks.onAllDone();
      playing = false;
    },
    stop: async () => {
      playing = false;
    },
    destroy: () => {
      playing = false;
    },
    isPlaying: () => playing,
  };
}

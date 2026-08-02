import * as Sentry from '@sentry/react-native';
import * as Speech from 'expo-speech';

import type { TtsProviderConfig } from '@/types/voice';

import { createEdgeTtsProvider as realEdgeProvider } from './edgeTts';
import { createMiniMaxTtsProvider as realMiniMaxProvider } from './minimaxTts';

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
  config: {
    provider: TtsProviderConfig['provider'];
    apiKey?: string;
    voiceId?: string;
  },
  callbacks: TtsCallbacks,
): TtsProvider {
  switch (config.provider) {
    case 'device':
      return createDeviceTtsProvider(callbacks);
    case 'edge':
      return createEdgeTtsProvider(callbacks, config.voiceId);
    case 'elevenlabs':
      return createElevenLabsTtsProvider(callbacks);
    case 'openai':
      return createOpenAiTtsProvider(callbacks);
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

// ---- Edge TTS (free, unofficial Microsoft readaloud endpoint) ----

// Real implementation lives in ./edgeTts — the WSS + Sec-MS-GEC token dance,
// MP3 capture and playback. This file only imports it so the provider
// interface stays the single seam the rest of the app calls.
function createEdgeTtsProvider(callbacks: TtsCallbacks, voiceId?: string): TtsProvider {
  return realEdgeProvider(callbacks, voiceId);
}

// ---- Not yet implemented ----

/**
 * A provider that says so instead of pretending.
 *
 * ElevenLabs and OpenAI TTS have no synthesis behind them yet. They used to
 * fire `onSentenceEnd` and `onAllDone` regardless, which reported the reply
 * spoken while the phone stayed silent — the user sees a finished turn and no
 * audio, with nothing anywhere to say why. Refusing loudly costs the same and
 * names the fix.
 *
 * When one of these is implemented, replace the call here — do not restore
 * the callbacks without real playback behind them.
 */
function createUnimplementedTtsProvider(
  label: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  return {
    speak: async (): Promise<void> => {
      const err = new Error(
        `${label} speech is not implemented yet. Pick the device voice, Edge, or MiniMax under Settings → Voice.`,
      );
      Sentry.captureException(err, { tags: { reason: 'voice' } });
      callbacks.onError(err);
      throw err;
    },
    stop: async () => undefined,
    destroy: () => undefined,
    isPlaying: () => false,
  };
}

function createElevenLabsTtsProvider(callbacks: TtsCallbacks): TtsProvider {
  return createUnimplementedTtsProvider('ElevenLabs', callbacks);
}

function createOpenAiTtsProvider(callbacks: TtsCallbacks): TtsProvider {
  return createUnimplementedTtsProvider('OpenAI', callbacks);
}

// ---- MiniMax ----

/** Real synthesis and playback — see `minimaxTts.ts`. */
function createMiniMaxTtsProvider(
  apiKey: string,
  voiceId: string,
  callbacks: TtsCallbacks,
): TtsProvider {
  return realMiniMaxProvider(apiKey, voiceId, callbacks);
}

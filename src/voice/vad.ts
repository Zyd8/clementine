/**
 * Voice Activity Detection for the INPUT side.
 *
 * Detects speech start, sustained silence (end-of-speech), enforces a 60s
 * maximum recording cap, and supports tap-to-cancel. Uses a configurable
 * silence threshold that defaults to 900ms.
 *
 * This is a pure-state model: the VAD client pushes audio level samples,
 * and the module transitions between SPEAKING / SILENT / CANCELLED states
 * with callbacks. No real audio hardware — mock the level feed in tests.
 */

export type VadState = 'INACTIVE' | 'SPEAKING' | 'SILENT' | 'CANCELLED';

export type VadCallbacks = {
  onSpeechStart: () => void;
  onEndOfSpeech: () => void;
  onMaxDuration: () => void;
};

export type VadClient = {
  /** Start listening. */
  start: () => void;
  /** Feed a raw audio level (0.0–1.0). */
  pushLevel: (level: number) => void;
  /** Cancel recording (tap-to-cancel). */
  cancel: () => void;
  /** Clean up timers. */
  destroy: () => void;
  /** Current state. */
  state: () => VadState;
  /** Elapsed recording time in ms. */
  elapsedMs: () => number;
};

/**
 * Create a VAD client.
 *
 * @param silenceTimeoutMs  How long the level must stay below `levelThreshold`
 *                          before end-of-speech fires (default: 900).
 * @param maxRecordingMs    Hard cap on recording duration (default: 60_000).
 * @param levelThreshold    Level below which is considered silence (default: 0.1).
 */
export function createVadClient(
  callbacks: VadCallbacks,
  {
    silenceTimeoutMs = 900,
    maxRecordingMs = 60_000,
    levelThreshold = 0.1,
  }: {
    silenceTimeoutMs?: number;
    maxRecordingMs?: number;
    levelThreshold?: number;
  } = {},
): VadClient {
  let currentState: VadState = 'INACTIVE';
  let startedAt = 0;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastNow = 0;

  const clearTimers = (): void => {
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  return {
    start: (): void => {
      if (currentState === 'SPEAKING' || currentState === 'SILENT') return;

      clearTimers();
      currentState = 'SILENT';
      startedAt = Date.now();

      // Schedule the max duration cap.
      maxTimer = setTimeout(() => {
        if (currentState === 'CANCELLED') return;
        callbacks.onMaxDuration();
      }, maxRecordingMs);
    },

    pushLevel: (level: number): void => {
      if (currentState === 'CANCELLED' || currentState === 'INACTIVE') return;

      lastNow = Date.now();

      if (level >= levelThreshold) {
        // Speech detected.
        if (currentState === 'SILENT') {
          currentState = 'SPEAKING';
          callbacks.onSpeechStart();
        }
        // Reset silence tracking.
        if (silenceTimer !== null) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (currentState === 'SPEAKING') {
        // Below threshold while speaking — start the silence countdown.
        if (silenceTimer === null) {
          silenceTimer = setTimeout(() => {
            if (currentState === 'CANCELLED') return;
            currentState = 'SILENT';
            callbacks.onEndOfSpeech();
          }, silenceTimeoutMs);
        }
      }
    },

    cancel: (): void => {
      clearTimers();
      currentState = 'CANCELLED';
    },

    destroy: (): void => {
      clearTimers();
      currentState = 'INACTIVE';
    },

    state: (): VadState => currentState,

    elapsedMs: (): number => {
      if (currentState === 'INACTIVE' || currentState === 'CANCELLED') return 0;
      return lastNow > startedAt ? lastNow - startedAt : Date.now() - startedAt;
    },
  };
}

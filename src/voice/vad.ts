/**
 * Voice Activity Detection for the INPUT side.
 *
 * Detects speech start, sustained silence (end-of-speech), enforces a 60s
 * maximum recording cap, and supports tap-to-cancel. Uses a configurable
 * silence threshold that defaults to 900ms.
 *
 * The speech threshold is measured against the room, not fixed. A fixed one
 * assumes quiet: with a fan, a TV, or traffic running, ambient level sits
 * permanently above it, so speech never "ends", the silence countdown never
 * starts, and every turn runs to the max-recording cap before it is sent.
 * Instead the quietest recent level is tracked as a noise floor and speech
 * has to clear it by a margin.
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
  /** The level a sample must currently reach to count as speech. */
  speechThreshold: () => number;
  /** The room's learned noise floor, 0 until the first sample. */
  noiseFloor: () => number;
  /** Elapsed recording time in ms. */
  elapsedMs: () => number;
};

/**
 * Create a VAD client.
 *
 * @param silenceTimeoutMs  How long the level must stay below `levelThreshold`
 *                          before end-of-speech fires (default: 900).
 * @param maxRecordingMs    Hard cap on recording duration (default: 60_000).
 * @param levelThreshold    Absolute minimum for the speech threshold, so a
 *                          silent room does not become infinitely sensitive
 *                          (default: 0.1).
 * @param noiseMargin       How far above the room's noise floor a level must
 *                          reach to count as speech (default: 0.12).
 * @param initialNoiseFloor Floor carried over from the previous turn. The
 *                          room does not change between one sentence and the
 *                          next, and relearning from scratch each turn drops
 *                          the threshold to its seed for the first samples —
 *                          long enough for the agent's own echo to clear it.
 */
export function createVadClient(
  callbacks: VadCallbacks,
  {
    silenceTimeoutMs = 900,
    maxRecordingMs = 60_000,
    levelThreshold = 0.1,
    noiseMargin = 0.12,
    initialNoiseFloor,
  }: {
    silenceTimeoutMs?: number;
    maxRecordingMs?: number;
    levelThreshold?: number;
    noiseMargin?: number;
    initialNoiseFloor?: number;
  } = {},
): VadClient {
  let currentState: VadState = 'INACTIVE';
  let startedAt = 0;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastNow = 0;

  /**
   * The room's quietest recent level. Null until the first sample.
   *
   * Falls instantly and rises slowly ("fast attack down, slow release up").
   * Falling instantly is what lets someone talk the moment the mic opens —
   * an opening word cannot drag the floor up with it, because the floor only
   * ever moves down quickly. Rising slowly lets a fan switched on mid-turn be
   * absorbed without a single loud sample resetting the room.
   */
  let noiseFloor: number | null = initialNoiseFloor ?? null;

  /** Ceiling on the floor, so a very loud room cannot mute speech entirely. */
  const MAX_NOISE_FLOOR = 0.75;
  /** How fast the floor climbs toward a louder room, per sample. */
  const RISE_RATE = 0.05;
  /**
   * How much of the room the very first sample is allowed to claim.
   *
   * The first sample has nothing to be compared against. If someone is
   * already talking when the mic opens it would seed the floor at speech
   * level and deafen the turn; capping the seed means a loud opening word
   * still clears the bar, while a quiet room seeds honestly below the cap.
   */
  const INITIAL_FLOOR_CAP = 0.3;
  /**
   * Rise rate applied while the level is *held* above the bar.
   *
   * Speech fluctuates and stops; a fan does not. Creeping the floor upward
   * during sustained sound means constant noise is eventually absorbed and
   * the turn can end, while real speech — which dips between words, dropping
   * the floor instantly — is never affected.
   */
  const SUSTAINED_RISE_RATE = 0.03;

  const trackNoise = (level: number, rate: number = RISE_RATE): void => {
    if (noiseFloor === null) {
      noiseFloor = Math.min(level, INITIAL_FLOOR_CAP);
      return;
    }
    if (level < noiseFloor) {
      noiseFloor = level;
      return;
    }
    noiseFloor = Math.min(MAX_NOISE_FLOOR, noiseFloor * (1 - rate) + level * rate);
  };

  /** Level a sample must reach to count as speech. */
  const speechThreshold = (): number =>
    Math.max(levelThreshold, (noiseFloor ?? 0) + noiseMargin);

  /**
   * Dropping out of speech uses a lower bar than entering it. Without that
   * gap, a level hovering right at the threshold flaps between speaking and
   * silent and the countdown restarts on every sample.
   */
  const silenceThreshold = (): number =>
    Math.max(levelThreshold * 0.6, (noiseFloor ?? 0) + noiseMargin * 0.6);

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
      // Keep what the last turn learned. It still tracks downward instantly,
      // so a genuinely quieter room is picked up within a sample anyway.
      noiseFloor = initialNoiseFloor ?? null;

      // Schedule the max duration cap.
      maxTimer = setTimeout(() => {
        if (currentState === 'CANCELLED') return;
        callbacks.onMaxDuration();
      }, maxRecordingMs);
    },

    pushLevel: (level: number): void => {
      if (currentState === 'CANCELLED' || currentState === 'INACTIVE') return;

      lastNow = Date.now();

      if (currentState === 'SPEAKING') {
        if (level < silenceThreshold()) {
          // Quiet again — learn from it, and start the countdown.
          trackNoise(level);
          if (silenceTimer === null) {
            silenceTimer = setTimeout(() => {
              if (currentState === 'CANCELLED') return;
              currentState = 'SILENT';
              callbacks.onEndOfSpeech();
            }, silenceTimeoutMs);
          }
        } else {
          // Still above the bar. Creep the floor up so that sound which never
          // stops — a fan switched on mid-turn — is eventually recognised as
          // the room rather than holding the turn open until the cap.
          trackNoise(level, SUSTAINED_RISE_RATE);
          if (silenceTimer !== null) {
            // A dip between words must not end the turn.
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        }
        return;
      }

      // Not speaking: this sample describes the room unless it clears the bar.
      // Seed before judging — with no floor yet the bar would sit at its
      // absolute minimum, and any room louder than that reads as speech.
      if (noiseFloor === null) trackNoise(level);

      if (level >= speechThreshold()) {
        currentState = 'SPEAKING';
        if (silenceTimer !== null) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        callbacks.onSpeechStart();
        return;
      }

      trackNoise(level);
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

    speechThreshold,

    noiseFloor: (): number => noiseFloor ?? 0,

    elapsedMs: (): number => {
      if (currentState === 'INACTIVE' || currentState === 'CANCELLED') return 0;
      return lastNow > startedAt ? lastNow - startedAt : Date.now() - startedAt;
    },
  };
}

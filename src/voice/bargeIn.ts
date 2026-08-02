/**
 * Barge-in: hearing the user start talking while the agent is still speaking,
 * so the reply can be cut short the way a person stops when interrupted.
 *
 * Harder than end-of-speech detection, because the mic is open while the
 * speaker is playing and hears the agent's own voice. Without real echo
 * cancellation on the device, the agent's own voice and the user's arrive at
 * the same mic at the same loudness — no threshold tells them apart from
 * level alone. Three things keep this usable anyway:
 *
 *   1. A bar measured against the echo itself. The reply's opening moments
 *      are almost never talked over, so the level during them IS the echo on
 *      this device at this volume — measure it and require speech to clear
 *      it. Guessing a fixed number cannot work: how much of the speaker the
 *      mic hears varies by phone, volume, and whether AEC exists at all.
 *   2. A grace window. The reply's own level is still settling in its first
 *      few seconds — TTS ramping up, a device without hardware echo
 *      cancellation still finding its footing — so nothing may fire yet. What
 *      would have fired instead gets folded into the echo measurement,
 *      raising the bar to match. The reply is not interruptible during this
 *      window; that is the deliberate trade for a bar that has had time to
 *      settle before it matters.
 *   3. A sustain. A single loud frame is a door, a cough, or a syllable of
 *      echo that slipped through. Real speech holds.
 *
 * All three are deliberately conservative: failing to barge in costs a wait,
 * while a false barge-in cuts the agent off mid-sentence for no reason.
 */

/** Never barge in below this, however quiet the room was measured to be. */
export const BARGE_IN_MIN_LEVEL = 0.3;
/** How much louder than ordinary speech a barge-in has to be. */
export const BARGE_IN_FACTOR = 1.3;
/** Consecutive samples required. At the 100ms poll, 3 is ~300ms of speech. */
export const BARGE_IN_SUSTAIN = 3;
/**
 * Samples spent measuring the echo before barge-in can fire. At the 100ms
 * poll, 5 is half a second — long enough to hear the reply's own level, short
 * enough that interrupting still feels immediate.
 */
export const BARGE_IN_CALIBRATION = 5;
/** How far above the measured echo a voice has to be to count as barging in. */
export const BARGE_IN_ECHO_MARGIN = 0.15;
/**
 * How long the reply is uninterruptible while the echo bar settles.
 *
 * Long enough that a device without real echo cancellation has time for its
 * bar to converge before barge-in matters; short enough that a reply worth
 * cutting off can still be cut off promptly once it does.
 */
export const BARGE_IN_GRACE_MS = 3000;
/**
 * Ceiling on the measured bar.
 *
 * Without it, a device whose mic hears its own speaker loudly measures an
 * echo near the top of the scale, the bar lands above anything a human can
 * produce, and the reply becomes uninterruptible — trading one failure for a
 * worse one. Past this point a raised voice must still get through, even at
 * the cost of the occasional self-interrupt.
 */
export const BARGE_IN_CEILING = 0.8;

export type BargeInDetector = {
  /** Feed a level. Returns true the moment a barge-in is confirmed. */
  push: (level: number) => boolean;
  /** Forget the run of loud samples so far. */
  reset: () => void;
  /** The level a sample has to clear, for display. */
  threshold: () => number;
  /** True while still measuring the echo — nothing can fire yet. */
  calibrating: () => boolean;
  /** True while the reply cannot yet be interrupted. */
  inGrace: () => boolean;
};

/**
 * @param speechThreshold The VAD's learned speech threshold from the turn
 *   just spoken — barge-in is measured relative to the same room.
 */
export function createBargeInDetector(
  speechThreshold: number,
  {
    factor = BARGE_IN_FACTOR,
    minLevel = BARGE_IN_MIN_LEVEL,
    sustain = BARGE_IN_SUSTAIN,
    calibration = BARGE_IN_CALIBRATION,
    echoMargin = BARGE_IN_ECHO_MARGIN,
    ceiling = BARGE_IN_CEILING,
    graceMs = BARGE_IN_GRACE_MS,
    now = () => Date.now(),
  }: {
    factor?: number;
    minLevel?: number;
    sustain?: number;
    calibration?: number;
    echoMargin?: number;
    ceiling?: number;
    graceMs?: number;
    /** Injectable clock, so the grace window is testable without real time. */
    now?: () => number;
  } = {},
): BargeInDetector {
  /** The floor before the echo has been heard. */
  const base = Math.max(minLevel, speechThreshold * factor);
  const startedAt = now();

  let seen = 0;
  /** Loudest level heard while the reply plays and nobody is talking over it. */
  let echoPeak = 0;
  let run = 0;
  let fired = false;

  const threshold = (): number =>
    Math.min(ceiling, Math.max(base, echoPeak + echoMargin));

  return {
    push: (level: number): boolean => {
      // Only ever fires once per turn; the caller tears the mic down on the
      // first true and a second would interrupt the turn it just started.
      if (fired) return false;

      seen += 1;
      if (seen <= calibration) {
        // The reply has only just started; this is the agent, not the user.
        echoPeak = Math.max(echoPeak, level);
        return false;
      }

      if (level < threshold()) {
        // Below the bar is echo by definition, so let a reply that gets
        // louder raise the bar with it rather than tripping it.
        echoPeak = Math.max(echoPeak, level * 0.5 + echoPeak * 0.5);
        run = 0;
        return false;
      }

      run += 1;
      if (run < sustain) return false;

      if (now() - startedAt < graceMs) {
        // Would otherwise fire, but the bar hasn't finished settling — bank
        // it as echo instead, so a loud reply raises its own bar rather than
        // being mistaken for the user once the window ends.
        echoPeak = Math.max(echoPeak, level);
        run = 0;
        return false;
      }

      fired = true;
      return true;
    },

    reset: (): void => {
      run = 0;
    },

    threshold,

    calibrating: (): boolean => seen < calibration,

    /** True while the reply cannot yet be interrupted. */
    inGrace: (): boolean => now() - startedAt < graceMs,
  };
}

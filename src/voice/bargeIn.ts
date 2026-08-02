/**
 * Barge-in: hearing the user start talking while the agent is still speaking,
 * so the reply can be cut short the way a person stops when interrupted.
 *
 * Harder than end-of-speech detection, because the mic is open while the
 * speaker is playing and hears the agent's own voice. Two things guard
 * against the reply interrupting itself:
 *
 *   1. A bar measured against the echo itself. The reply's opening moments
 *      are almost never talked over, so the level during them IS the echo on
 *      this device at this volume — measure it and require speech to clear
 *      it. Guessing a fixed number cannot work: how much of the speaker the
 *      mic hears varies by phone, volume, and whether AEC exists at all.
 *   2. A sustain. A single loud frame is a door, a cough, or a syllable of
 *      echo that slipped through. Real speech holds.
 *
 * Both are deliberately conservative: failing to barge in costs a wait, while
 * a false barge-in cuts the agent off mid-sentence for no reason.
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

export type BargeInDetector = {
  /** Feed a level. Returns true the moment a barge-in is confirmed. */
  push: (level: number) => boolean;
  /** Forget the run of loud samples so far. */
  reset: () => void;
  /** The level a sample has to clear, for display. */
  threshold: () => number;
  /** True while still measuring the echo — nothing can fire yet. */
  calibrating: () => boolean;
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
  }: {
    factor?: number;
    minLevel?: number;
    sustain?: number;
    calibration?: number;
    echoMargin?: number;
  } = {},
): BargeInDetector {
  /** The floor before the echo has been heard. */
  const base = Math.max(minLevel, speechThreshold * factor);

  let seen = 0;
  /** Loudest level heard while the reply plays and nobody is talking over it. */
  let echoPeak = 0;
  let run = 0;
  let fired = false;

  const threshold = (): number => Math.max(base, echoPeak + echoMargin);

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

      fired = true;
      return true;
    },

    reset: (): void => {
      run = 0;
    },

    threshold,

    calibrating: (): boolean => seen < calibration,
  };
}

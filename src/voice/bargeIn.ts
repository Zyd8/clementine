/**
 * Barge-in: hearing the user start talking while the agent is still speaking,
 * so the reply can be cut short the way a person stops when interrupted.
 *
 * Harder than end-of-speech detection, because the mic is open while the
 * speaker is playing and hears the agent's own voice. Two things guard
 * against the reply interrupting itself:
 *
 *   1. A raised bar. The mic is recorded with the `voice_communication`
 *      source, so the platform applies echo cancellation where the hardware
 *      supports it — but residual echo is normal, so the level still has to
 *      clear a threshold well above where ordinary speech would.
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

export type BargeInDetector = {
  /** Feed a level. Returns true the moment a barge-in is confirmed. */
  push: (level: number) => boolean;
  /** Forget the run of loud samples so far. */
  reset: () => void;
  /** The level a sample has to clear, for display. */
  threshold: () => number;
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
  }: { factor?: number; minLevel?: number; sustain?: number } = {},
): BargeInDetector {
  const threshold = Math.max(minLevel, speechThreshold * factor);
  let run = 0;
  let fired = false;

  return {
    push: (level: number): boolean => {
      // Only ever fires once per turn; the caller tears the mic down on the
      // first true and a second would interrupt the turn it just started.
      if (fired) return false;

      if (level < threshold) {
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

    threshold: (): number => threshold,
  };
}

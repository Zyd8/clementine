import {
  BARGE_IN_MIN_LEVEL,
  BARGE_IN_SUSTAIN,
  createBargeInDetector,
} from './bargeIn';

describe('createBargeInDetector', () => {
  const feed = (detector: ReturnType<typeof createBargeInDetector>, level: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = detector.push(level) || fired;
    return fired;
  };

  it('fires once speech is held above the bar', () => {
    const detector = createBargeInDetector(0.4);
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
  });

  /** A single loud frame is a door or a syllable of echo, not an interruption. */
  it('ignores one loud frame', () => {
    const detector = createBargeInDetector(0.4);
    expect(detector.push(0.9)).toBe(false);
  });

  it('needs the run to be unbroken', () => {
    const detector = createBargeInDetector(0.4);
    detector.push(0.9);
    detector.push(0.9);
    detector.push(0.01); // a gap resets the run
    expect(detector.push(0.9)).toBe(false);
  });

  /**
   * The reply must not interrupt itself. Echo of the agent's own voice sits
   * below ordinary speech level, so the bar is set above it.
   */
  it('does not fire on levels at ordinary speech level', () => {
    const detector = createBargeInDetector(0.4);
    expect(feed(detector, 0.45, 20)).toBe(false);
  });

  it('never sits below the absolute minimum, however quiet the room', () => {
    const detector = createBargeInDetector(0);
    expect(detector.threshold()).toBe(BARGE_IN_MIN_LEVEL);
    expect(feed(detector, BARGE_IN_MIN_LEVEL - 0.01, 20)).toBe(false);
  });

  it('scales with a noisy room, where speech itself is louder', () => {
    const quiet = createBargeInDetector(0.15);
    const noisy = createBargeInDetector(0.6);
    expect(noisy.threshold()).toBeGreaterThan(quiet.threshold());
  });

  /**
   * The caller tears the mic down on the first true; a second would interrupt
   * the listening turn it just started.
   */
  it('fires only once', () => {
    const detector = createBargeInDetector(0.4);
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(false);
  });

  it('reset drops the run without re-arming a fired detector', () => {
    const detector = createBargeInDetector(0.4);
    detector.push(0.9);
    detector.reset();
    expect(detector.push(0.9)).toBe(false);
  });
});

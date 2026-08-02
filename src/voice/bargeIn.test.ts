import {
  BARGE_IN_CALIBRATION,
  BARGE_IN_MIN_LEVEL,
  BARGE_IN_SUSTAIN,
  createBargeInDetector,
} from './bargeIn';

type Detector = ReturnType<typeof createBargeInDetector>;

describe('createBargeInDetector', () => {
  const feed = (detector: Detector, level: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = detector.push(level) || fired;
    return fired;
  };

  /**
   * The opening samples measure the echo, so every test that is about
   * detection has to get past them first. `echo` is what the mic hears of the
   * agent's own voice on this device.
   */
  const calibrate = (detector: Detector, echo = 0.1) => {
    feed(detector, echo, BARGE_IN_CALIBRATION);
    return detector;
  };

  it('fires once speech is held above the bar', () => {
    const detector = calibrate(createBargeInDetector(0.4));
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
  });

  /**
   * The bug this measurement exists for: the agent heard itself and cut its
   * own reply off. However loud the echo is, it is the thing being measured,
   * so it can never clear its own bar.
   */
  it("never fires on the reply's own echo, however loud it is", () => {
    const detector = createBargeInDetector(0.4);
    expect(feed(detector, 0.85, 60)).toBe(false);
  });

  it('still hears a voice over a loud echo', () => {
    const detector = calibrate(createBargeInDetector(0.4), 0.6);
    expect(feed(detector, 0.95, BARGE_IN_SUSTAIN)).toBe(true);
  });

  it('cannot fire before the echo has been measured', () => {
    const detector = createBargeInDetector(0.4);
    expect(feed(detector, 0.99, BARGE_IN_CALIBRATION)).toBe(false);
    expect(detector.calibrating()).toBe(false);
  });

  it('raises the bar as the echo does, rather than tripping on it', () => {
    const detector = calibrate(createBargeInDetector(0.4), 0.3);
    const before = detector.threshold();
    // The reply gets louder, but stays below the bar — so it is still echo.
    feed(detector, 0.4, 20);
    expect(detector.threshold()).toBeGreaterThan(before);
    expect(feed(detector, 0.4, 20)).toBe(false);
  });

  /** A single loud frame is a door or a syllable of echo, not an interruption. */
  it('ignores one loud frame', () => {
    const detector = calibrate(createBargeInDetector(0.4));
    expect(detector.push(0.9)).toBe(false);
  });

  it('needs the run to be unbroken', () => {
    const detector = calibrate(createBargeInDetector(0.4));
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
    const detector = calibrate(createBargeInDetector(0.4));
    expect(feed(detector, 0.45, 20)).toBe(false);
  });

  it('never sits below the absolute minimum, however quiet the room', () => {
    const detector = createBargeInDetector(0);
    expect(detector.threshold()).toBe(BARGE_IN_MIN_LEVEL);
    expect(feed(detector, BARGE_IN_MIN_LEVEL - 0.01, 20)).toBe(false);
  });

  it('reports while it is still measuring', () => {
    const detector = createBargeInDetector(0.4);
    expect(detector.calibrating()).toBe(true);
    feed(detector, 0.1, BARGE_IN_CALIBRATION);
    expect(detector.calibrating()).toBe(false);
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
    const detector = calibrate(createBargeInDetector(0.4));
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(false);
  });

  it('reset drops the run without re-arming a fired detector', () => {
    const detector = calibrate(createBargeInDetector(0.4));
    detector.push(0.9);
    detector.reset();
    expect(detector.push(0.9)).toBe(false);
  });
});

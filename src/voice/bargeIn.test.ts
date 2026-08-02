import {
  BARGE_IN_CALIBRATION,
  BARGE_IN_CEILING,
  BARGE_IN_GRACE_MS,
  BARGE_IN_MIN_LEVEL,
  BARGE_IN_SUSTAIN,
  createBargeInDetector,
} from './bargeIn';

type Detector = ReturnType<typeof createBargeInDetector>;

/** A clock that starts at 0 and only advances when the test tells it to. */
const fakeClock = () => {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('createBargeInDetector', () => {
  const feed = (detector: Detector, level: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = detector.push(level) || fired;
    return fired;
  };

  /**
   * Detection tests are not about the grace window, so they run past it —
   * `now` is fixed beyond BARGE_IN_GRACE_MS from the start.
   */
  const pastGrace = (speechThreshold: number, opts: Parameters<typeof createBargeInDetector>[1] = {}) => {
    // The first call is `startedAt`; every call after must already read as
    // past the grace window relative to it.
    let calls = 0;
    const now = () => (calls++ === 0 ? 0 : BARGE_IN_GRACE_MS + 1);
    return createBargeInDetector(speechThreshold, { now, ...opts });
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
    const detector = calibrate(pastGrace(0.4));
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
  });

  /**
   * The bug this measurement exists for: the agent heard itself and cut its
   * own reply off. The echo is the thing being measured, so it cannot clear
   * its own bar.
   *
   * The one exception is deliberate: past BARGE_IN_CEILING the bar stops
   * rising, because a bar above human range would make the reply
   * uninterruptible — a worse failure than an occasional self-interrupt. A
   * device that echoes THAT loudly needs echo cancellation, not a threshold.
   */
  it("never fires on the reply's own echo at any realistic level", () => {
    const detector = pastGrace(0.4);
    expect(feed(detector, 0.6, 60)).toBe(false);
  });

  it('still hears a voice over a loud echo', () => {
    const detector = calibrate(pastGrace(0.4), 0.6);
    expect(feed(detector, 0.95, BARGE_IN_SUSTAIN)).toBe(true);
  });

  it('cannot fire before the echo has been measured', () => {
    const detector = pastGrace(0.4);
    expect(feed(detector, 0.99, BARGE_IN_CALIBRATION)).toBe(false);
    expect(detector.calibrating()).toBe(false);
  });

  it('raises the bar as the echo does, rather than tripping on it', () => {
    const detector = calibrate(pastGrace(0.4), 0.3);
    const before = detector.threshold();
    // The reply gets louder, but stays below the bar — so it is still echo.
    feed(detector, 0.4, 20);
    expect(detector.threshold()).toBeGreaterThan(before);
    expect(feed(detector, 0.4, 20)).toBe(false);
  });

  /** A single loud frame is a door or a syllable of echo, not an interruption. */
  it('ignores one loud frame', () => {
    const detector = calibrate(pastGrace(0.4));
    expect(detector.push(0.9)).toBe(false);
  });

  it('needs the run to be unbroken', () => {
    const detector = calibrate(pastGrace(0.4));
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
    const detector = calibrate(pastGrace(0.4));
    expect(feed(detector, 0.45, 20)).toBe(false);
  });

  it('never sits below the absolute minimum, however quiet the room', () => {
    const detector = pastGrace(0);
    expect(detector.threshold()).toBe(BARGE_IN_MIN_LEVEL);
    expect(feed(detector, BARGE_IN_MIN_LEVEL - 0.01, 20)).toBe(false);
  });

  it('reports while it is still measuring', () => {
    const detector = pastGrace(0.4);
    expect(detector.calibrating()).toBe(true);
    feed(detector, 0.1, BARGE_IN_CALIBRATION);
    expect(detector.calibrating()).toBe(false);
  });

  it('scales with a noisy room, where speech itself is louder', () => {
    const quiet = pastGrace(0.15);
    const noisy = pastGrace(0.6);
    expect(noisy.threshold()).toBeGreaterThan(quiet.threshold());
  });

  /**
   * The caller tears the mic down on the first true; a second would interrupt
   * the listening turn it just started.
   */
  it('fires only once', () => {
    const detector = calibrate(pastGrace(0.4));
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(true);
    expect(feed(detector, 0.9, BARGE_IN_SUSTAIN)).toBe(false);
  });

  it('reset drops the run without re-arming a fired detector', () => {
    const detector = calibrate(pastGrace(0.4));
    detector.push(0.9);
    detector.reset();
    expect(detector.push(0.9)).toBe(false);
  });
});

/**
 * A device whose mic hears its own speaker loudly would otherwise measure an
 * echo near the top of the scale and set a bar no human could clear — trading
 * a reply that interrupts itself for one that cannot be interrupted at all.
 */
describe('createBargeInDetector — staying interruptible', () => {
  const feed = (detector: Detector, level: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = detector.push(level) || fired;
    return fired;
  };

  const pastGrace = (speechThreshold: number) => {
    let calls = 0;
    const now = () => (calls++ === 0 ? 0 : BARGE_IN_GRACE_MS + 1);
    return createBargeInDetector(speechThreshold, { now });
  };

  it('caps the bar so a raised voice always has somewhere to go', () => {
    const detector = pastGrace(0.4);
    feed(detector, 0.95, BARGE_IN_CALIBRATION); // a very loud echo
    expect(detector.threshold()).toBeLessThanOrEqual(BARGE_IN_CEILING);
  });

  it('still lets a shout through on a device with bad echo', () => {
    const detector = pastGrace(0.4);
    feed(detector, 0.95, BARGE_IN_CALIBRATION);
    expect(feed(detector, 1, BARGE_IN_SUSTAIN)).toBe(true);
  });
});

/**
 * The grace window: the reply is uninterruptible for its first few seconds
 * so the echo bar has time to settle — a device with no real echo
 * cancellation needs longer than a handful of samples to find its footing,
 * and firing on it before then is the exact bug this whole module exists to
 * avoid.
 */
describe('createBargeInDetector — grace window', () => {
  const feed = (detector: Detector, level: number, times: number) => {
    let fired = false;
    for (let i = 0; i < times; i++) fired = detector.push(level) || fired;
    return fired;
  };

  it('reports itself in grace from the moment it is created', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    expect(detector.inGrace()).toBe(true);
  });

  it('leaves grace once the window elapses', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    clock.advance(BARGE_IN_GRACE_MS);
    expect(detector.inGrace()).toBe(false);
  });

  /** The one behaviour asked for: no interrupt in the first few seconds. */
  it('does not fire on real speech while still in the grace window', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    feed(detector, 0.1, BARGE_IN_CALIBRATION); // calibrate the echo first

    clock.advance(BARGE_IN_GRACE_MS - 500); // still inside the window
    expect(feed(detector, 0.95, BARGE_IN_SUSTAIN)).toBe(false);
  });

  it('fires on the same speech once the window has passed', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    feed(detector, 0.1, BARGE_IN_CALIBRATION);

    clock.advance(BARGE_IN_GRACE_MS + 1);
    expect(feed(detector, 0.95, BARGE_IN_SUSTAIN)).toBe(true);
  });

  /**
   * What would have fired is banked as echo instead of discarded — a reply
   * that is still loud when grace ends should not immediately trip on itself
   * just because the window closed mid-sentence.
   */
  it('folds a loud sustained level from the grace window into the bar', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    feed(detector, 0.1, BARGE_IN_CALIBRATION);

    const before = detector.threshold();
    feed(detector, 0.9, BARGE_IN_SUSTAIN); // would fire, but grace suppresses it
    expect(detector.threshold()).toBeGreaterThan(before);
  });

  it('does not carry a false start into a real barge-in after grace ends', () => {
    const clock = fakeClock();
    const detector = createBargeInDetector(0.4, { now: clock.now });
    feed(detector, 0.1, BARGE_IN_CALIBRATION);
    feed(detector, 0.9, BARGE_IN_SUSTAIN); // suppressed, banked as echo

    clock.advance(BARGE_IN_GRACE_MS + 1);
    // A quiet gap, then real speech — detected fresh against the raised bar.
    feed(detector, 0.05, 5);
    expect(feed(detector, 1, BARGE_IN_SUSTAIN)).toBe(true);
  });

  it('defaults to the real clock when none is injected', () => {
    const detector = createBargeInDetector(0.4);
    expect(detector.inGrace()).toBe(true);
  });
});

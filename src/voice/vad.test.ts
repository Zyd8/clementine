import { createVadClient, VadCallbacks, VadClient } from '@/voice/vad';

describe('VAD client', () => {
  let callbacks: jest.Mocked<VadCallbacks>;
  let client: VadClient;

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = {
      onSpeechStart: jest.fn(),
      onEndOfSpeech: jest.fn(),
      onMaxDuration: jest.fn(),
    };
    client = createVadClient(callbacks);
  });

  afterEach(() => {
    client.destroy();
    jest.useRealTimers();
  });

  describe('start', () => {
    it('starts in the SILENT state', () => {
      client.start();
      expect(client.state()).toBe('SILENT');
    });

    it('is a no-op if already active', () => {
      client.start();
      client.start();
      expect(client.state()).toBe('SILENT');
    });
  });

  describe('speech detection', () => {
    it('fires onSpeechStart when the level passes the threshold', () => {
      client.start();
      client.pushLevel(0.5);

      expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);
      expect(client.state()).toBe('SPEAKING');
    });

    it('does NOT fire onSpeechStart for below-threshold level', () => {
      client.start();
      client.pushLevel(0.05);

      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
      expect(client.state()).toBe('SILENT');
    });

    it('fires onSpeechStart only once per continuous speech', () => {
      client.start();
      client.pushLevel(0.5);
      client.pushLevel(0.6);
      client.pushLevel(0.7);

      expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('end-of-speech', () => {
    it('fires onEndOfSpeech after sustained silence ≥ threshold (900ms default)', () => {
      client.start();
      client.pushLevel(0.5); // started speaking
      expect(client.state()).toBe('SPEAKING');

      // Below-threshold levels
      client.pushLevel(0.05);

      // Advance just under the threshold — should not fire yet
      jest.advanceTimersByTime(899);
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();

      // Cross the threshold
      jest.advanceTimersByTime(1);
      expect(callbacks.onEndOfSpeech).toHaveBeenCalledTimes(1);
      expect(client.state()).toBe('SILENT');
    });

    it('resets the silence timer when speech resumes before the threshold', () => {
      client.start();
      client.pushLevel(0.5); // speaking
      client.pushLevel(0.05); // silent

      jest.advanceTimersByTime(400);

      // Resume speaking before the 900ms threshold
      client.pushLevel(0.6);
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();

      // Now go silent again — a new 900ms timer starts
      client.pushLevel(0.05);
      jest.advanceTimersByTime(900);
      expect(callbacks.onEndOfSpeech).toHaveBeenCalledTimes(1);
    });

    it('does not cut on short pauses inside words', () => {
      client.start();
      // Simulate rapid speech with tiny gaps (below the 900ms threshold)
      client.pushLevel(0.5);
      jest.advanceTimersByTime(100);
      client.pushLevel(0.05);
      jest.advanceTimersByTime(200);
      client.pushLevel(0.6);
      jest.advanceTimersByTime(150);
      client.pushLevel(0.05);
      jest.advanceTimersByTime(200);
      client.pushLevel(0.4);

      // None of those gaps lasted 900ms
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();
    });

    it('uses the configured silenceTimeoutMs', () => {
      client.destroy();
      client = createVadClient(callbacks, { silenceTimeoutMs: 300 });

      client.start();
      client.pushLevel(0.5); // speaking
      client.pushLevel(0.05); // silent

      jest.advanceTimersByTime(300);
      expect(callbacks.onEndOfSpeech).toHaveBeenCalledTimes(1);
    });
  });

  describe('max recording cap', () => {
    it('fires onMaxDuration after maxRecordingMs (default 60s)', () => {
      client.start();

      jest.advanceTimersByTime(60_000);
      expect(callbacks.onMaxDuration).toHaveBeenCalledTimes(1);
    });

    it('uses the configured maxRecordingMs', () => {
      client.destroy();
      client = createVadClient(callbacks, { maxRecordingMs: 5000 });

      client.start();
      jest.advanceTimersByTime(5000);
      expect(callbacks.onMaxDuration).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire onMaxDuration if cancelled before the cap', () => {
      client.start();
      jest.advanceTimersByTime(30_000);
      client.cancel();
      jest.advanceTimersByTime(30_001);

      expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('transitions to CANCELLED and stops all timers', () => {
      client.start();
      client.pushLevel(0.5);

      client.cancel();
      expect(client.state()).toBe('CANCELLED');

      // Advance past the silence threshold — should not fire
      jest.advanceTimersByTime(1000);
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();

      // Advance past the max cap — should not fire
      jest.advanceTimersByTime(60_000);
      expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
    });

    it('aborts cleanly — no callbacks fire after cancel', () => {
      client.start();
      client.cancel();

      jest.advanceTimersByTime(90_000);
      expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();
      expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('resets to INACTIVE', () => {
      client.start();
      client.destroy();
      expect(client.state()).toBe('INACTIVE');
    });

    it('clears all timers', () => {
      client.start();
      client.destroy();

      jest.advanceTimersByTime(90_000);
      expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
      expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();
    });
  });

  describe('elapsedMs', () => {
    it('returns 0 before start', () => {
      expect(client.elapsedMs()).toBe(0);
    });

    it('returns 0 after cancel', () => {
      client.start();
      jest.advanceTimersByTime(5000);
      client.cancel();
      expect(client.elapsedMs()).toBe(0);
    });

    it('returns elapsed time while active', () => {
      client.start();
      jest.advanceTimersByTime(10_000);
      // elapsedMs uses Date.now, but with fake timers we can still verify it tracks
      expect(client.elapsedMs()).toBeGreaterThan(0);
    });
  });
});

/**
 * A fixed threshold assumes a quiet room. In a room with a fan, a TV, or
 * traffic, the ambient level sits permanently above it: speech never "ends",
 * the silence countdown never starts, and every turn runs to the max
 * recording cap before it is sent. The floor has to be learned from the room.
 */
describe('VAD in a noisy room', () => {
  let callbacks: jest.Mocked<VadCallbacks>;
  let client: VadClient;

  const ROOM_TONE = 0.35;

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = {
      onSpeechStart: jest.fn(),
      onEndOfSpeech: jest.fn(),
      onMaxDuration: jest.fn(),
    };
    client = createVadClient(callbacks, { silenceTimeoutMs: 900 });
  });

  afterEach(() => {
    client.destroy();
    jest.useRealTimers();
  });

  /** Sustained room tone is not speech, however far above a fixed 0.1 it is. */
  it('does not hear steady background noise as speech', () => {
    client.start();
    for (let i = 0; i < 30; i++) client.pushLevel(ROOM_TONE);

    expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
    expect(client.state()).toBe('SILENT');
  });

  it('still hears real speech over that noise', () => {
    client.start();
    for (let i = 0; i < 30; i++) client.pushLevel(ROOM_TONE);

    client.pushLevel(0.8);
    expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);
    expect(client.state()).toBe('SPEAKING');
  });

  /**
   * The actual bug: dropping back to room tone has to count as silence, or
   * the turn only ever ends at the max-duration cap.
   */
  it('ends the turn when speech drops back to room tone', () => {
    client.start();
    for (let i = 0; i < 30; i++) client.pushLevel(ROOM_TONE);
    client.pushLevel(0.8);
    expect(client.state()).toBe('SPEAKING');

    for (let i = 0; i < 5; i++) client.pushLevel(ROOM_TONE);
    jest.advanceTimersByTime(900);

    expect(callbacks.onEndOfSpeech).toHaveBeenCalledTimes(1);
    expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
  });

  /** A quiet room must not become insensitive — the floor has a minimum. */
  it('keeps a floor in a silent room so faint speech still registers', () => {
    client.start();
    for (let i = 0; i < 30; i++) client.pushLevel(0);

    client.pushLevel(0.15);
    expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);
  });

  /**
   * A step up in noise is indistinguishable from someone starting to talk, so
   * the fan does trip speech start. What must not happen is the turn staying
   * open until the cap: sound that never stops gets absorbed as the room.
   */
  it('re-learns a room that gets louder instead of recording to the cap', () => {
    client.start();
    for (let i = 0; i < 20; i++) client.pushLevel(0.1);
    // Someone turns on a fan, and it stays on.
    for (let i = 0; i < 60; i++) client.pushLevel(0.4);
    jest.advanceTimersByTime(900);

    expect(callbacks.onEndOfSpeech).toHaveBeenCalledTimes(1);
    expect(callbacks.onMaxDuration).not.toHaveBeenCalled();
  });

  /**
   * Learning the floor must not swallow someone who starts talking straight
   * away — the floor tracks downward instantly, so an opening word cannot
   * raise it.
   */
  it('hears speech that starts immediately, before any quiet is sampled', () => {
    client.start();
    client.pushLevel(0.9);

    expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1);
  });

  /** Brief dips inside a sentence must not end the turn early. */
  it('rides out a pause between words', () => {
    client.start();
    for (let i = 0; i < 20; i++) client.pushLevel(ROOM_TONE);
    client.pushLevel(0.8);

    // A short gap, then speech resumes before the silence timeout elapses.
    client.pushLevel(ROOM_TONE);
    jest.advanceTimersByTime(400);
    client.pushLevel(0.8);
    jest.advanceTimersByTime(900);

    expect(callbacks.onEndOfSpeech).not.toHaveBeenCalled();
    expect(client.state()).toBe('SPEAKING');
  });

  it('exposes the threshold it settled on', () => {
    client.start();
    for (let i = 0; i < 30; i++) client.pushLevel(ROOM_TONE);

    expect(client.speechThreshold()).toBeGreaterThan(ROOM_TONE);
    expect(client.speechThreshold()).toBeLessThan(1);
  });
});

/**
 * The room does not change between one sentence and the next. Relearning it
 * from scratch every turn dropped the threshold to its conservative seed for the
 * first samples of every turn — and the barge-in bar is derived from that
 * threshold, so the agent's own echo cleared it and cut the reply off.
 */
describe('VAD across turns', () => {
  let callbacks: jest.Mocked<VadCallbacks>;

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = {
      onSpeechStart: jest.fn(),
      onEndOfSpeech: jest.fn(),
      onMaxDuration: jest.fn(),
    };
  });

  afterEach(() => jest.useRealTimers());

  it('starts from the floor the previous turn learned', () => {
    const client = createVadClient(callbacks, { initialNoiseFloor: 0.35 });
    client.start();

    // Room tone that a fresh client would have to learn is silent from
    // the very first sample.
    client.pushLevel(0.35);

    expect(callbacks.onSpeechStart).not.toHaveBeenCalled();
    expect(client.speechThreshold()).toBeGreaterThan(0.35);
    client.destroy();
  });

  it('holds that floor across a stop and restart', () => {
    const client = createVadClient(callbacks, { initialNoiseFloor: 0.35 });
    client.start();
    client.pushLevel(0.9);
    client.destroy();

    client.start();
    client.pushLevel(0.35);

    expect(callbacks.onSpeechStart).toHaveBeenCalledTimes(1); // only the 0.9
    client.destroy();
  });

  /** A genuinely quieter room still wins — the floor tracks down instantly. */
  it('drops to a quieter room within one sample', () => {
    const client = createVadClient(callbacks, { initialNoiseFloor: 0.35 });
    client.start();
    client.pushLevel(0.02);

    expect(client.speechThreshold()).toBeLessThan(0.2);
    client.destroy();
  });
});

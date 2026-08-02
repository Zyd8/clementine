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

import { executeInterrupt, type InterruptBehavior } from '@/voice/interrupt';

describe('interrupt', () => {
  let stopTts: jest.Mock;
  let cancelRun: jest.Mock;

  beforeEach(() => {
    stopTts = jest.fn();
    cancelRun = jest.fn();
  });

  describe('stop_speech_only', () => {
    it('stops TTS playback', () => {
      executeInterrupt('stop_speech_only', stopTts, cancelRun);
      expect(stopTts).toHaveBeenCalledTimes(1);
    });

    it('does NOT cancel the agent run', () => {
      executeInterrupt('stop_speech_only', stopTts, cancelRun);
      expect(cancelRun).not.toHaveBeenCalled();
    });

    it('always returns nextState: LISTENING', () => {
      const result = executeInterrupt('stop_speech_only', stopTts, cancelRun);
      expect(result.nextState).toBe('LISTENING');
    });

    it('cancelRun is false in result', () => {
      const result = executeInterrupt('stop_speech_only', stopTts, cancelRun);
      expect(result.cancelRun).toBe(false);
    });
  });

  describe('stop_speech_and_run', () => {
    it('stops TTS playback', () => {
      executeInterrupt('stop_speech_and_run', stopTts, cancelRun);
      expect(stopTts).toHaveBeenCalledTimes(1);
    });

    it('cancels the agent run', () => {
      executeInterrupt('stop_speech_and_run', stopTts, cancelRun);
      expect(cancelRun).toHaveBeenCalledTimes(1);
    });

    it('always returns nextState: LISTENING', () => {
      const result = executeInterrupt('stop_speech_and_run', stopTts, cancelRun);
      expect(result.nextState).toBe('LISTENING');
    });

    it('cancelRun is true in result', () => {
      const result = executeInterrupt('stop_speech_and_run', stopTts, cancelRun);
      expect(result.cancelRun).toBe(true);
    });
  });

  it('interrupt always lands in LISTENING, never IDLE', () => {
    const behaviors: InterruptBehavior[] = ['stop_speech_only', 'stop_speech_and_run'];

    for (const behavior of behaviors) {
      const result = executeInterrupt(behavior, stopTts, cancelRun);
      expect(result.nextState).toBe('LISTENING');
    }
  });

  it('stopping the reply is the start of YOUR turn, not the end of the exchange', () => {
    const result = executeInterrupt('stop_speech_and_run', stopTts, cancelRun);

    // After interrupt the mic should be live — the caller should transition to LISTENING
    expect(result.nextState).toBe('LISTENING');
    expect(result.nextState).not.toBe('IDLE');
    expect(result.nextState).not.toBe('PROCESSING');
  });
});

/**
 * Interrupt handling for voice chat.
 *
 * Supports two modes:
 * - `stop_speech_only`: stops TTS playback only, the run continues.
 * - `stop_speech_and_run`: stops TTS playback AND cancels the agent run.
 *
 * The critical contract: after interrupt, the mic must auto-enter LISTENING.
 * Interrupt is NOT the end of the exchange — it's the start of the user's turn.
 * The AI yields the floor so the user can talk over/interrupt it, and their
 * speech auto-sends on silence just like a normal turn.
 */

/**
 * Interrupt result tells the caller what state to enter next.
 * Always LISTENING — see ARCHITECTURE.md "Turn flow" and the spec.
 */
export type InterruptAction = {
  /** Always 'LISTENING' — AI yields the floor to the user. */
  nextState: 'LISTENING';
  /** Whether the agent run should be cancelled. */
  cancelRun: boolean;
};

export type InterruptBehavior = 'stop_speech_only' | 'stop_speech_and_run';

/**
 * Execute an interrupt.
 *
 * @param behavior     Which interrupt mode.
 * @param stopTts      Callback to stop TTS playback immediately.
 * @param cancelRun    Callback to cancel the agent run (may be no-op for speech_only).
 */
export function executeInterrupt(
  behavior: InterruptBehavior,
  stopTts: () => void,
  cancelRun: () => void,
): InterruptAction {
  stopTts();

  const cancel = behavior === 'stop_speech_and_run';
  if (cancel) {
    cancelRun();
  }

  // ALWAYS enter LISTENING after interrupt.
  // Stopping the reply is the start of the USER's turn, not the end of the exchange.
  return { nextState: 'LISTENING', cancelRun: cancel };
}

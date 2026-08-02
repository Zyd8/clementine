import * as Sentry from '@sentry/react-native';
import { useCallback, useRef, useState } from 'react';

import { createRun, stopRun, streamRunEvents } from '@/api/runs';
import { useChatStore, type ProfileId } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useUsageStore } from '@/stores/usage';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import type { VoiceChatState } from '@/types/voice';
import { createAsrProvider, type AsrProvider } from '@/voice/asr';
import { executeInterrupt } from '@/voice/interrupt';
import { createSentenceBuffer, type SentenceBuffer } from '@/voice/sentenceBuffer';
import { createTtsProvider, type TtsProvider } from '@/voice/tts';
import { createVadClient, type VadClient, type VadCallbacks } from '@/voice/vad';

/**
 * Full voice chat lifecycle hook.
 *
 * Manages the voice state machine (IDLE → LISTENING → PROCESSING → PLAYING),
 * ties together ASR, VAD, TTS, and the existing chat run infrastructure.
 *
 * Interaction contract:
 *   IDLE      → tap → LISTENING (mic opens, VAD monitors)
 *   LISTENING → VAD silence → auto-send transcript → SSE → TTS → PLAYING
 *   LISTENING → tap → cancel → IDLE (discard recording)
 *   PLAYING   → tap → interrupt → auto-enter LISTENING
 *
 * The hook uses the voice profile store for ASR/TTS providers and VAD config.
 * State machine transitions are guarded by a ref to avoid stale closures in
 * async callbacks — every callback reads `stateRef.current` at invocation time,
 * not at creation time.
 */

export function useVoiceChat(profileId: ProfileId = null) {
  const connection = useConnectionStore((s) => s.connection);
  const voiceProfile = useVoiceProfileStore((s) => s.profile);

  const [voiceState, setVoiceState] = useState<VoiceChatState>('IDLE');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs for mutable state that doesn't trigger re-renders and avoids
  // stale closures in async callbacks.
  const stateRef = useRef<VoiceChatState>('IDLE');
  const asrRef = useRef<AsrProvider | null>(null);
  const ttsRef = useRef<TtsProvider | null>(null);
  const vadRef = useRef<VadClient | null>(null);
  const sentenceBufRef = useRef<SentenceBuffer>(createSentenceBuffer());
  const inFlight = useRef(false);
  const fullTranscript = useRef('');

  // ---- State transition helpers (update both React state and ref) ----

  const transition = useCallback((next: VoiceChatState) => {
    stateRef.current = next;
    setVoiceState(next);
  }, []);

  const enterIdle = useCallback(() => {
    transition('IDLE');
    setLiveTranscript('');
    fullTranscript.current = '';
    setAudioLevel(0);

    try {
      asrRef.current?.cancel();
    } catch { /* noop */ }
    asrRef.current = null;

    vadRef.current?.destroy();
    vadRef.current = null;

    sentenceBufRef.current.reset();
  }, [transition]);

  // ---- Send the run + stream + TTS ----

  const sendRun = useCallback(
    async (input: string) => {
      if (!connection || inFlight.current) return;

      const store = useChatStore.getState();
      inFlight.current = true;
      transition('PROCESSING');
      setLiveTranscript('');

      store.appendUserMessage(profileId, input);

      const { baseUrl, apiKey } = connection;
      let runId: string | undefined;

      try {
        const handle = await createRun(baseUrl, apiKey, { input });
        runId = handle.runId;
        store.setActiveRun(profileId, runId);

        // Set up TTS
        ttsRef.current?.destroy();
        const tts = createTtsProvider(voiceProfile.tts, {
          onSentenceEnd: () => {
            // Sentence finished — next will auto-play if queued.
          },
          onAllDone: () => {
            // Only reset to IDLE if we're still in PLAYING.
            if (stateRef.current === 'PLAYING') {
              enterIdle();
            }
          },
          onError: (error) => {
            Sentry.captureException(error, { tags: { reason: 'voice' } });
            if (stateRef.current === 'PLAYING' || stateRef.current === 'PROCESSING') {
              enterIdle();
            }
          },
        });
        ttsRef.current = tts;
        sentenceBufRef.current.reset();

        let firstSentence = true;

        // Stream SSE events
        for await (const event of streamRunEvents(baseUrl, apiKey, runId)) {
          useChatStore.getState().applyEvent(profileId, event);

          if (event.type === 'assistant.delta') {
            // Feed agent text through the sentence buffer → TTS
            sentenceBufRef.current.push(event.text, (sentence) => {
              void tts.speak(sentence).catch((err) => {
                Sentry.captureException(
                  err instanceof Error ? err : new Error(String(err)),
                  { tags: { reason: 'voice' } },
                );
              });
              if (firstSentence && stateRef.current === 'PROCESSING') {
                firstSentence = false;
                transition('PLAYING');
              }
            });
          }

          if (event.type === 'run.completed' && event.usage) {
            useUsageStore.getState().addUsage(profileId, event.usage);
          }
        }

        // Flush any remaining buffered text
        sentenceBufRef.current.flush((sentence) => {
          void tts.speak(sentence).catch((err) => {
            Sentry.captureException(
              err instanceof Error ? err : new Error(String(err)),
              { tags: { reason: 'voice' } },
            );
          });
          if (firstSentence && stateRef.current === 'PROCESSING') {
            firstSentence = false;
            transition('PLAYING');
          }
        });

        // If no sentences ever came through (silent run), just go to idle
        if (stateRef.current === 'PROCESSING') {
          enterIdle();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Voice run failed.';
        Sentry.captureException(
          error instanceof Error ? error : new Error(String(error)),
          { tags: { reason: 'voice' } },
        );

        if (runId) {
          useChatStore
            .getState()
            .applyEvent(profileId, { type: 'run.failed', message });
        }
        enterIdle();
      } finally {
        inFlight.current = false;
        useChatStore.getState().setActiveRun(profileId, null);
      }
    },
    [connection, profileId, voiceProfile.tts, transition, enterIdle],
  );

  // ---- End-of-speech → auto-send ----

  const handleEndOfSpeech = useCallback(async () => {
    if (!connection || inFlight.current) return;

    const transcript = fullTranscript.current.trim();
    if (!transcript) {
      enterIdle();
      return;
    }

    // Stop ASR, get final transcript
    try {
      const final = await asrRef.current?.stop();
      if (final) {
        fullTranscript.current = final;
      }
    } catch {
      // If ASR stop fails, use what we have.
    }

    asrRef.current = null;
    vadRef.current?.destroy();
    vadRef.current = null;

    const text = fullTranscript.current.trim();
    if (!text) {
      enterIdle();
      return;
    }

    await sendRun(text);
  }, [connection, enterIdle, sendRun]);

  const handleMaxDuration = useCallback(async () => {
    if (!connection || inFlight.current) return;

    asrRef.current = null;
    vadRef.current?.destroy();
    vadRef.current = null;

    const text = fullTranscript.current.trim();
    if (!text) {
      enterIdle();
      return;
    }

    await sendRun(text);
  }, [connection, enterIdle, sendRun]);

  // ---- Enter LISTENING ----

  const enterListening = useCallback(async () => {
    if (inFlight.current) return;

    transition('LISTENING');
    setLiveTranscript('');
    fullTranscript.current = '';

    // Create ASR provider from the voice profile
    const asr = createAsrProvider(voiceProfile.asr);
    asrRef.current = asr;

    // Create VAD client
    const vadCallbacks: VadCallbacks = {
      onSpeechStart: () => {
        // Speech started — already in LISTENING.
      },
      onEndOfSpeech: () => {
        void (async () => {
          if (stateRef.current !== 'LISTENING') return;
          await handleEndOfSpeech();
        })();
      },
      onMaxDuration: () => {
        void (async () => {
          if (stateRef.current !== 'LISTENING') return;
          await handleMaxDuration();
        })();
      },
    };

    const vad = createVadClient(vadCallbacks, {
      silenceTimeoutMs: voiceProfile.endOfSpeechTimeoutMs,
      maxRecordingMs: voiceProfile.maxRecordingMs,
    });
    vadRef.current = vad;
    vad.start();

    // Start ASR — feeds partial transcripts to liveTranscript
    await asr.start((result) => {
      fullTranscript.current = result.transcript;
      setLiveTranscript(result.transcript);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceProfile, transition]);

  // ---- Cancel (LISTENING → IDLE, discard recording) ----

  const cancelListening = useCallback(async () => {
    asrRef.current?.cancel();
    asrRef.current = null;
    vadRef.current?.cancel();
    vadRef.current = null;
    enterIdle();
  }, [enterIdle]);

  // ---- Interrupt (PLAYING → LISTENING) ----

  const interruptPlayback = useCallback(async () => {
    const tts = ttsRef.current;
    ttsRef.current = null;

    sentenceBufRef.current.reset();

    executeInterrupt(
      voiceProfile.interruptBehavior,
      () => {
        void tts?.stop();
      },
      () => {
        const runId = useChatStore.getState().activeRun(profileId);
        if (connection && runId) {
          void stopRun(connection.baseUrl, connection.apiKey, runId).catch(
            () => undefined,
          );
        }
      },
    );

    // Always enter LISTENING after interrupt.
    await enterListening();
  }, [profileId, connection, voiceProfile.interruptBehavior, enterListening]);

  // ---- Audio session interruption (incoming call steals mic/speaker) ----

  const handleAudioInterruption = useCallback(() => {
    // Hard-stop to IDLE. A phone call is more important than the AI turn.
    // Resuming after interruption adds state complexity not needed for v1.
    ttsRef.current?.stop().catch(() => undefined);
    ttsRef.current = null;

    asrRef.current?.cancel();
    asrRef.current = null;

    vadRef.current?.cancel();
    vadRef.current = null;

    sentenceBufRef.current.reset();

    enterIdle();
  }, [enterIdle]);

  // ---- Main tap handler ----

  const tapMic = useCallback(async () => {
    const current = stateRef.current;
    switch (current) {
      case 'IDLE':
        await enterListening();
        break;
      case 'LISTENING':
        await cancelListening();
        break;
      case 'PLAYING':
        await interruptPlayback();
        break;
      case 'PROCESSING':
        // Tap during PROCESSING is ignored.
        break;
    }
  }, [enterListening, cancelListening, interruptPlayback]);

  // ---- Audio level (for VoiceWaveform) ----

  const pushAudioLevel = useCallback((level: number) => {
    setAudioLevel(level);
    if (vadRef.current) {
      vadRef.current.pushLevel(level);
    }
  }, []);

  return {
    voiceState,
    liveTranscript,
    audioLevel,
    tapMic,

    // Audio session interruption handler (for incoming calls, etc.)
    handleAudioInterruption,

    // Exposed for the test harness and provider bridging.
    simulateEndOfSpeech: handleEndOfSpeech,
    pushPartialTranscript: useCallback((text: string) => {
      fullTranscript.current = text;
      setLiveTranscript(text);
    }, []),
    pushAudioLevel,
  };
}

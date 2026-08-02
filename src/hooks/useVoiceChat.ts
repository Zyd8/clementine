import * as Sentry from '@sentry/react-native';
import { useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createRun, PHONE_INSTRUCTIONS, stopRun, streamRunEvents, VOICE_INSTRUCTIONS } from '@/api/runs';
import { useChatStore, type ProfileId } from '@/stores/chat';
import { useConnectionStore } from '@/stores/connection';
import { useUsageStore } from '@/stores/usage';
import { useVoiceProfileStore } from '@/stores/voiceProfile';
import type { VoiceChatState } from '@/types/voice';
import { createAsrProvider, type AsrProvider } from '@/voice/asr';
import { createRecorder, RECORDING_FORMAT, type Recorder } from '@/voice/recorder';
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
  /**
   * The level the VAD currently treats as speech, learned from the room.
   * Surfaced so the "hearing you" ring agrees with the thing that actually
   * decides the turn is over — a fixed visual floor would glow at room tone
   * the VAD is correctly ignoring.
   */
  const [speechThreshold, setSpeechThreshold] = useState(0.12);
  // What the voice pipeline is doing right now, surfaced on the voice screen
  // so a stuck or failed step is visible instead of reading as "listening".
  const [voiceStatus, setVoiceStatus] = useState('');

  const setStatus = useCallback((message: string) => {
    setVoiceStatus(message);
  }, []);

  // One recorder for the hook's lifetime. `useAudioRecorder` owns the native
  // handle; the adapter around it is what the ASR provider talks to. Lazy
  // state rather than a ref, because a ref may not be written during render.
  //
  // The recorder must be CONSTRUCTED with metering enabled: expo-audio reads
  // isMeteringEnabled at construction (`new AudioRecorder(options)`), not at
  // prepare time. Without it `getStatus().metering` is undefined, the level
  // reads as constant silence, and the VAD never hears speech — the app sits
  // in LISTENING forever. This is the same format the recorder passes to
  // prepareToRecordAsync; the construction-time flag is what actually enables
  // the meter.
  const audioRecorder = useAudioRecorder(RECORDING_FORMAT);
  const [recorder] = useState<Recorder>(() => createRecorder(audioRecorder as never));

  // Refs for mutable state that doesn't trigger re-renders and avoids
  // stale closures in async callbacks.
  const stateRef = useRef<VoiceChatState>('IDLE');
  const asrRef = useRef<AsrProvider | null>(null);
  const ttsRef = useRef<TtsProvider | null>(null);
  const vadRef = useRef<VadClient | null>(null);
  const sentenceBufRef = useRef<SentenceBuffer>(createSentenceBuffer());
  const inFlight = useRef(false);
  /**
   * `enterListening` is defined below and depends (transitively) on `sendRun`,
   * so `sendRun` cannot close over it directly. A ref breaks the cycle.
   */
  const enterListeningRef = useRef<() => Promise<void>>(async () => undefined);
  /**
   * The room's noise floor, carried between turns.
   *
   * The VAD relearns from the level feed, but a fresh client starts from a
   * conservative seed — so for the first samples of every turn the threshold
   * sat far below where the room had already been measured. The room is the
   * same one it was a sentence ago; remember it.
   */
  const noiseFloorRef = useRef<number | undefined>(undefined);
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
    setStatus('');

    try {
      asrRef.current?.cancel();
    } catch { /* noop */ }
    asrRef.current = null;

    vadRef.current?.destroy();
    vadRef.current = null;

    sentenceBufRef.current.reset();
  }, [transition, setStatus]);

  // ---- Send the run + stream + TTS ----

  const sendRun = useCallback(
    async (input: string) => {
      if (!connection || inFlight.current) return;

      const store = useChatStore.getState();
      inFlight.current = true;
      transition('PROCESSING');
      setLiveTranscript('');
      setStatus('Sending to Hermes…');

      store.appendUserMessage(profileId, input);

      const { baseUrl, apiKey } = connection;
      let runId: string | undefined;

      try {
        // Voice replies get their own instructions layered on top of the
        // standard phone ones — a reply built for reading is unlistenable
        // read aloud.
        const handle = await createRun(baseUrl, apiKey, {
          input,
          instructions: `${PHONE_INSTRUCTIONS} ${VOICE_INSTRUCTIONS}`,
        });
        runId = handle.runId;
        store.setActiveRun(profileId, runId);

        // Set up TTS
        ttsRef.current?.destroy();
        const tts = createTtsProvider({
          provider: voiceProfile.tts.provider,
          apiKey: voiceProfile.tts.keys[voiceProfile.tts.provider] ?? '',
          ...(voiceProfile.tts.voiceId ? { voiceId: voiceProfile.tts.voiceId } : {}),
        }, {
          onSentenceEnd: () => {
            // Sentence finished — next will auto-play if queued.
          },
          onAllDone: () => {
            // Tool-status narration (below) also finishes through this
            // callback while the run is still PROCESSING — that is not the
            // reply ending, so nothing here should fire until real reply
            // content has actually put the machine into PLAYING.
            if (stateRef.current !== 'PLAYING') return;
            setStatus('Reply complete');
            // The reply finishing is the cue to listen again — a conversation
            // does not require a tap between every turn. Deferred by a tick so
            // sendRun's `finally` clears its in-flight guard first; without
            // that, enterListening returns early and the mic never reopens.
            setTimeout(() => {
              if (stateRef.current !== 'PLAYING') return;
              void enterListeningRef.current();
            }, 0);
          },
          onError: (error) => {
            Sentry.captureException(error, { tags: { reason: 'voice' } });
            if (stateRef.current === 'PLAYING' || stateRef.current === 'PROCESSING') {
              // enterIdle clears the status; set the error AFTER so it survives.
              enterIdle();
            }
            setStatus(`Voice playback error: ${error.message}`);
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
                setStatus('Speaking…');
                transition('PLAYING');
              }
            });
          }

          if (event.type === 'tool.started') {
            // Otherwise a tool call is silence: the reply hasn't started
            // and there is no visible feed on this screen, so a slow tool
            // reads as the app having hung. Speaks over the same TTS
            // instance the reply will use, so it queues before the reply
            // rather than talking over it — deliberately NOT transitioning
            // to PLAYING, so this can't be mistaken for the reply finishing
            // if the tool is still running when it stops speaking.
            setStatus(`Using ${event.tool}…`);
            void tts.speak(`One moment, using ${event.tool}.`).catch((err) => {
              Sentry.captureException(
                err instanceof Error ? err : new Error(String(err)),
                { tags: { reason: 'voice' } },
              );
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
            setStatus('Speaking…');
            transition('PLAYING');
          }
        });

        // If no sentences ever came through (silent run), just go to idle
        if (stateRef.current === 'PROCESSING') {
          // enterIdle clears the status; set the notice AFTER so it survives.
          enterIdle();
          setStatus('No spoken reply — check the chat for the response');
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
        // enterIdle clears the status; set the error AFTER so it survives.
        enterIdle();
        setStatus(`Run failed: ${message}`);
      } finally {
        inFlight.current = false;
        useChatStore.getState().setActiveRun(profileId, null);
      }
    },
    [connection, profileId, voiceProfile.tts, transition, enterIdle, setStatus],
  );

  // ---- End-of-speech → auto-send ----

  const handleEndOfSpeech = useCallback(async () => {
    if (!connection || inFlight.current) return;

    // No early bail on an empty `fullTranscript`. A batch provider produces
    // nothing until `stop()` returns — checking first meant every turn was
    // abandoned before it was ever transcribed. Only providers that stream
    // partials populate this before the mic closes.
    setStatus('Transcribing…');
    try {
      const final = await asrRef.current?.stop();
      if (final) {
        fullTranscript.current = final;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed.';
      // enterIdle clears the status; set the error AFTER so it survives.
      enterIdle();
      setStatus(`Transcription failed: ${message}`);
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { tags: { reason: 'voice' } },
      );
      return;
    }

    asrRef.current = null;
    vadRef.current?.destroy();
    vadRef.current = null;

    const text = fullTranscript.current.trim();
    if (!text) {
      // enterIdle clears the status; set the notice AFTER so it survives.
      enterIdle();
      setStatus('No speech detected — try again');
      return;
    }

    await sendRun(text);
  }, [connection, enterIdle, sendRun, setStatus]);

  const handleMaxDuration = useCallback(async () => {
    if (!connection || inFlight.current) return;

    // Same as end-of-speech: the clip still has to be transcribed, or hitting
    // the recording cap silently discards everything the user just said.
    setStatus('Max recording time — transcribing…');
    try {
      const final = await asrRef.current?.stop();
      if (final) {
        fullTranscript.current = final;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed.';
      // enterIdle clears the status; set the error AFTER so it survives.
      enterIdle();
      setStatus(`Transcription failed: ${message}`);
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { tags: { reason: 'voice' } },
      );
      return;
    }

    asrRef.current = null;
    vadRef.current?.destroy();
    vadRef.current = null;

    const text = fullTranscript.current.trim();
    if (!text) {
      // enterIdle clears the status; set the notice AFTER so it survives.
      enterIdle();
      setStatus('No speech detected — try again');
      return;
    }

    await sendRun(text);
  }, [connection, enterIdle, sendRun, setStatus]);

  // ---- Enter LISTENING ----

  const enterListening = useCallback(async () => {
    if (inFlight.current) return;

    transition('LISTENING');
    setLiveTranscript('');
    fullTranscript.current = '';
    setStatus('Opening microphone…');

    // Create ASR provider from the voice profile
    const asr = createAsrProvider(
      {
        provider: voiceProfile.asr.provider,
        apiKey: voiceProfile.asr.keys[voiceProfile.asr.provider] ?? '',
      },
      recorder,
    );
    asrRef.current = asr;

    // Create VAD client
    const vadCallbacks: VadCallbacks = {
      onSpeechStart: () => {
        // Speech started — already in LISTENING.
        setStatus('Listening…');
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
      noiseMargin: voiceProfile.vadNoiseMargin,
      ...(noiseFloorRef.current !== undefined
        ? { initialNoiseFloor: noiseFloorRef.current }
        : {}),
    });
    vadRef.current = vad;
    vad.start();

    // Start ASR — feeds partial transcripts to liveTranscript. A failure
    // here (mic permission denied, recorder error) must not leave the state
    // machine parked in LISTENING with a silent mic — surface it and return
    // to IDLE so the screen can say what went wrong.
    try {
      await asr.start((result) => {
        fullTranscript.current = result.transcript;
        setLiveTranscript(result.transcript);
      });
      setStatus('Listening — speak now');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the microphone.';
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { tags: { reason: 'voice' } },
      );
      asrRef.current = null;
      vadRef.current?.destroy();
      vadRef.current = null;
      // enterIdle clears the status; set the error AFTER so it survives.
      enterIdle();
      setStatus(`Mic error: ${message}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceProfile, transition, handleEndOfSpeech, handleMaxDuration, enterIdle, setStatus]);

  // Keep the ref pointing at the current closure for the auto-relisten above.
  useEffect(() => {
    enterListeningRef.current = enterListening;
  }, [enterListening]);

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

  // ---- Leaving the screen (× / back) ----

  /**
   * Full stop, for leaving voice mode entirely.
   *
   * Unlike `interruptPlayback` this never re-enters LISTENING — there is no
   * screen left to listen on — and unlike `handleAudioInterruption` it always
   * cancels the underlying Hermes run rather than leaving it running
   * unheard, since closing the screen is the user ending the exchange, not a
   * transient distraction to resume from.
   */
  const leaveVoiceMode = useCallback(() => {
    ttsRef.current?.stop().catch(() => undefined);
    ttsRef.current = null;

    const runId = useChatStore.getState().activeRun(profileId);
    if (connection && runId) {
      void stopRun(connection.baseUrl, connection.apiKey, runId).catch(() => undefined);
    }

    asrRef.current?.cancel();
    asrRef.current = null;

    vadRef.current?.cancel();
    vadRef.current = null;

    sentenceBufRef.current.reset();

    enterIdle();
  }, [connection, profileId, enterIdle]);

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
      setSpeechThreshold(vadRef.current.speechThreshold());
      // Remembered continuously, so a turn that ends abruptly still leaves
      // the room measured for the next one.
      noiseFloorRef.current = vadRef.current.noiseFloor();
    }
  }, []);

  /**
   * Poll the mic while listening.
   *
   * The VAD is a pure state model — it decides end-of-speech from a level
   * feed and can only do that if something feeds it. Nothing did, so silence
   * detection never fired and a turn never auto-sent. 100ms is fine grained
   * enough for a ~900ms silence timeout without waking the JS thread hard.
   */
  useEffect(() => {
    if (voiceState !== 'LISTENING') return;

    const id = setInterval(() => {
      pushAudioLevel(recorder.level());
    }, 100);

    return () => clearInterval(id);
  }, [voiceState, pushAudioLevel, recorder]);

  /**
   * No barge-in: the mic stays fully closed while the agent speaks.
   *
   * It used to open during PLAYING purely to meter, so a loud enough level
   * could interrupt automatically. But the mic then hears the agent's own
   * voice at full volume — the phone plays TTS through the same speaker it
   * records from — and without real echo cancellation nothing separates that
   * from a real interruption. Tapping the ring is the reliable way to
   * interrupt now; not opening the mic at all is what makes tapping reliable,
   * since there is no echo left to confuse it.
   */

  return {
    voiceState,
    liveTranscript,
    audioLevel,
    speechThreshold,
    voiceStatus,
    tapMic,

    // Audio session interruption handler (for incoming calls, etc.)
    handleAudioInterruption,
    leaveVoiceMode,

    // Exposed for the test harness and provider bridging.
    simulateEndOfSpeech: handleEndOfSpeech,
    pushPartialTranscript: useCallback((text: string) => {
      fullTranscript.current = text;
      setLiveTranscript(text);
    }, []),
    pushAudioLevel,
  };
}

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type RecorderState,
} from 'expo-audio';

/**
 * Microphone capture for voice mode.
 *
 * Thin on purpose: it opens the mic, writes one clip, and reports a level so
 * the VAD can decide when the user stopped talking. Everything above it —
 * silence timeouts, the state machine, transcription — already exists and is
 * tested, and none of it should know about `expo-audio`.
 *
 * Whisper wants 16kHz mono PCM. Recording it directly avoids a resample step
 * before inference, which on a phone is worth more than the file size.
 */

export type Recorder = {
  /** Asks for the mic if needed. Returns false when the user says no. */
  requestPermission: () => Promise<boolean>;
  start: () => Promise<void>;
  /** Stops and returns the clip's file URI, or null if nothing was captured. */
  stop: () => Promise<string | null>;
  /** Stops and discards. */
  cancel: () => Promise<void>;
  /** Current input level, 0–1, for the waveform and the VAD. */
  level: () => number;
};

/** Whisper models expect 16kHz mono; sending it directly avoids a resample. */
export const RECORDING_FORMAT = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16_000,
  numberOfChannels: 1,
  // Not in any preset, and without it `getStatus().metering` is undefined —
  // the level reads as constant silence, the VAD never hears speech start,
  // and a turn never auto-sends.
  isMeteringEnabled: true,
  // Barge-in needs the mic open while the agent is speaking, so the mic hears
  // the speaker. This source asks the platform for echo cancellation and
  // automatic gain control where the hardware has them — without it the
  // reply reliably interrupts itself.
  audioSource: 'voice_communication' as const,
};

/**
 * `expo-audio` reports metering in dBFS: 0 is clipping, -160 is silence. The
 * VAD and the waveform both want 0–1, and anything below -60dB is room tone
 * on a phone mic, so that is the floor.
 */
const QUIET_DB = -60;

export const meteringToLevel = (db: number | undefined): number => {
  if (db === undefined || Number.isNaN(db)) return 0;
  if (db <= QUIET_DB) return 0;
  if (db >= 0) return 1;
  return (db - QUIET_DB) / -QUIET_DB;
};

type AudioRecorderLike = {
  prepareToRecordAsync: (options: unknown) => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
  uri: string | null;
  getStatus: () => RecorderState;
};

export function createRecorder(recorder: AudioRecorderLike): Recorder {
  let recording = false;
  /**
   * The in-flight `start()`, if any.
   *
   * `recording` only becomes true after two awaits, so two callers in the
   * same tick — barge-in metering and a listening turn both reaching for the
   * mic — used to sail past the guard and prepare the native recorder twice,
   * which it rejects outright. Concurrent starts now share one attempt, and
   * stop/cancel wait for it rather than slipping past a half-open session.
   */
  let starting: Promise<void> | null = null;

  return {
    requestPermission: async () => {
      const granted = await AudioModule.requestRecordingPermissionsAsync();
      return granted.granted;
    },

    start: async () => {
      if (recording) return;
      if (starting) return starting;

      starting = (async () => {
        // Without this Android records through the earpiece route and the
        // level never rises above room tone.
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          // playAndRecord otherwise routes to the earpiece on iOS, which
          // makes the agent inaudible during the barge-in overlap.
          shouldRouteThroughEarpiece: false,
        });
        await recorder.prepareToRecordAsync(RECORDING_FORMAT);
        recorder.record();
        recording = true;
      })();

      try {
        await starting;
      } finally {
        starting = null;
      }
    },

    stop: async () => {
      // A stop landing mid-prepare has to wait for the session to exist,
      // or it returns null and leaves the mic open forever.
      if (starting) await starting.catch(() => undefined);
      if (!recording) return null;
      recording = false;
      await recorder.stop();
      // Hand the speaker back, or TTS playback is routed to the earpiece.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return recorder.uri;
    },

    cancel: async () => {
      if (starting) await starting.catch(() => undefined);
      if (!recording) return;
      recording = false;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    },

    level: () => (recording ? meteringToLevel(recorder.getStatus().metering) : 0),
  };
}

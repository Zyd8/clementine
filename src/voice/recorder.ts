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
const WHISPER_FORMAT = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16_000,
  numberOfChannels: 1,
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

  return {
    requestPermission: async () => {
      const granted = await AudioModule.requestRecordingPermissionsAsync();
      return granted.granted;
    },

    start: async () => {
      if (recording) return;
      // Without this Android records through the earpiece route and the
      // level never rises above room tone.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(WHISPER_FORMAT);
      recorder.record();
      recording = true;
    },

    stop: async () => {
      if (!recording) return null;
      recording = false;
      await recorder.stop();
      // Hand the speaker back, or TTS playback is routed to the earpiece.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return recorder.uri;
    },

    cancel: async () => {
      if (!recording) return;
      recording = false;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    },

    level: () => (recording ? meteringToLevel(recorder.getStatus().metering) : 0),
  };
}

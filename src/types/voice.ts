import { z } from 'zod';

/**
 * Voice profile — the user's voice configuration, stored on-device.
 *
 * Voice keys are the USER's; the connection (and its profiles) are the AGENT's.
 * Two separate stores, per ARCHITECTURE.md.
 *
 * Free-first defaults: Groq Whisper ASR on its free tier + the platform's own
 * TTS voice. Transcription needs a key; speech does not. On-device Whisper
 * was removed — it required a third-party native module and a 75MB model
 * download for every install.
 */

// ---- ASR provider config ----

export const asrProviderSchema = z.object({
  provider: z.enum(['groq', 'deepgram', 'openai']),
  /**
   * One key per provider, not one key per kind. Switching from Groq to
   * Deepgram used to carry Groq's key across, so the new provider was called
   * with a credential it would reject — and going back had lost the original.
   */
  keys: z.record(z.string(), z.string()).default({}),
});

export type AsrProviderConfig = z.infer<typeof asrProviderSchema>;

// ---- TTS provider config ----

export const ttsProviderSchema = z.object({
  // `device` is the platform's built-in speech engine: free, offline, no key.
  // It is the default because Edge TTS is an unofficial endpoint that now
  // requires rotating DRM tokens and breaks without notice — not something to
  // put in front of every reply.
  provider: z.enum(['device', 'edge', 'elevenlabs', 'openai', 'minimax']),
  /** One key per provider — see `asrProviderSchema.keys`. */
  keys: z.record(z.string(), z.string()).default({}),
  voiceId: z.string().optional(),
});

export type TtsProviderConfig = z.infer<typeof ttsProviderSchema>;

// ---- Interrupt behavior ----

export type InterruptBehavior = 'stop_speech_only' | 'stop_speech_and_run';

// ---- Full voice profile ----

export const voiceProfileSchema = z.object({
  asr: asrProviderSchema.default({ provider: 'groq', keys: {} }),
  tts: ttsProviderSchema.default({ provider: 'device', keys: {} }),
  interruptBehavior: z
    .enum(['stop_speech_only', 'stop_speech_and_run'])
    .default('stop_speech_and_run'),
  endOfSpeechTimeoutMs: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .default(900),
  maxRecordingMs: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .default(60_000),
  /**
   * How far above the room's measured noise floor a level must reach to count
   * as speech. The default is tuned for a normal room; raise it if the mic
   * triggers on background noise, lower it if quiet speech is missed.
   */
  vadNoiseMargin: z.number().min(0.02).max(0.5).default(0.12),
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const VOICE_PROFILE_DEFAULTS: VoiceProfile = voiceProfileSchema.parse(
  {},
) as VoiceProfile;

// ---- Voice chat state machine ----

export type VoiceChatState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'PLAYING';

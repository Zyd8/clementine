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
  apiKey: z.string().optional(),
});

export type AsrProviderConfig = z.infer<typeof asrProviderSchema>;

// ---- TTS provider config ----

export const ttsProviderSchema = z.object({
  // `device` is the platform's built-in speech engine: free, offline, no key.
  // It is the default because Edge TTS is an unofficial endpoint that now
  // requires rotating DRM tokens and breaks without notice — not something to
  // put in front of every reply.
  provider: z.enum(['device', 'edge', 'elevenlabs', 'openai', 'minimax']),
  apiKey: z.string().optional(),
  voiceId: z.string().optional(),
});

export type TtsProviderConfig = z.infer<typeof ttsProviderSchema>;

// ---- Interrupt behavior ----

export type InterruptBehavior = 'stop_speech_only' | 'stop_speech_and_run';

// ---- Full voice profile ----

export const voiceProfileSchema = z.object({
  asr: asrProviderSchema.default({ provider: 'groq' }),
  tts: ttsProviderSchema.default({ provider: 'device' }),
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
});

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const VOICE_PROFILE_DEFAULTS: VoiceProfile = voiceProfileSchema.parse(
  {},
) as VoiceProfile;

// ---- Voice chat state machine ----

export type VoiceChatState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'PLAYING';

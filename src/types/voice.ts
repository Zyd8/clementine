import { z } from 'zod';

/**
 * Voice profile — the user's voice configuration, stored on-device.
 *
 * Voice keys are the USER's; the connection (and its profiles) are the AGENT's.
 * Two separate stores, per ARCHITECTURE.md.
 *
 * Free-first defaults: on-device whisper.cpp ASR + Edge TTS = working voice
 * with zero keys. BYO providers are the upgrade path.
 */

// ---- ASR provider config ----

export const asrProviderSchema = z.object({
  provider: z.enum(['whisper_cpp', 'groq', 'deepgram', 'openai']),
  apiKey: z.string().optional(),
});

export type AsrProviderConfig = z.infer<typeof asrProviderSchema>;

// ---- TTS provider config ----

export const ttsProviderSchema = z.object({
  provider: z.enum(['edge', 'elevenlabs', 'openai', 'minimax']),
  apiKey: z.string().optional(),
  voiceId: z.string().optional(),
});

export type TtsProviderConfig = z.infer<typeof ttsProviderSchema>;

// ---- Interrupt behavior ----

export type InterruptBehavior = 'stop_speech_only' | 'stop_speech_and_run';

// ---- Full voice profile ----

export const voiceProfileSchema = z.object({
  asr: asrProviderSchema.default({ provider: 'whisper_cpp' }),
  tts: ttsProviderSchema.default({ provider: 'edge' }),
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

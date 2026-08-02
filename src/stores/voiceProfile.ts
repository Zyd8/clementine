import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import {
  voiceProfileSchema,
  VOICE_PROFILE_DEFAULTS,
  type AsrProviderConfig,
  type InterruptBehavior,
  type TtsProviderConfig,
  type VoiceProfile,
} from '@/types/voice';

/**
 * Voice profile store — the USER's voice configuration (SecureStore).
 *
 * Separate from the connection store per ARCHITECTURE.md:
 * "Voice keys are the USER's; the connection (and its profiles) are the
 * AGENT's." Two stores, zero overlap.
 *
 * Defaults: Groq Whisper ASR (free tier, needs a key) + the platform's own
 * TTS voice (free, offline, no key).
 * BYO providers (Groq/Deepgram/OpenAI ASR, ElevenLabs/OpenAI/MiniMax TTS)
 * are configured here.
 */

export const VOICE_PROFILE_STORAGE_KEY = 'clementine.voiceProfile';

type VoiceProfileState = {
  profile: VoiceProfile;
  hydrated: boolean;

  // Getters for convenience
  asrConfig: () => AsrProviderConfig;
  ttsConfig: () => TtsProviderConfig;
  interruptBehavior: () => InterruptBehavior;
  endOfSpeechTimeoutMs: () => number;
  maxRecordingMs: () => number;

  // Mutations
  setProfile: (profile: VoiceProfile) => Promise<void>;
  updateAsrConfig: (config: Partial<AsrProviderConfig>) => Promise<void>;
  updateTtsConfig: (config: Partial<TtsProviderConfig>) => Promise<void>;
  /** Tune how far above room noise counts as speech. */
  setVadNoiseMargin: (margin: number) => Promise<void>;
  /** Store one provider's key without touching any other provider's. */
  setAsrKey: (provider: string, key: string) => Promise<void>;
  setTtsKey: (provider: string, key: string) => Promise<void>;
  hydrate: () => Promise<void>;
  reset: () => Promise<void>;
};

const persist = (profile: VoiceProfile): Promise<void> =>
  SecureStore.setItemAsync(VOICE_PROFILE_STORAGE_KEY, JSON.stringify(profile));

export const useVoiceProfileStore = create<VoiceProfileState>((set, get) => ({
  profile: { ...VOICE_PROFILE_DEFAULTS },
  hydrated: false,

  asrConfig: () => get().profile.asr,
  ttsConfig: () => get().profile.tts,
  interruptBehavior: () => get().profile.interruptBehavior,
  endOfSpeechTimeoutMs: () => get().profile.endOfSpeechTimeoutMs,
  maxRecordingMs: () => get().profile.maxRecordingMs,

  setProfile: async (profile: VoiceProfile): Promise<void> => {
    set({ profile, hydrated: true });
    await persist(profile);
  },

  updateAsrConfig: async (config: Partial<AsrProviderConfig>): Promise<void> => {
    const current = get().profile;
    const updated: VoiceProfile = {
      ...current,
      asr: { ...current.asr, ...config },
    };
    set({ profile: updated });
    await persist(updated);
  },

  updateTtsConfig: async (config: Partial<TtsProviderConfig>): Promise<void> => {
    const current = get().profile;
    const updated: VoiceProfile = {
      ...current,
      tts: { ...current.tts, ...config },
    };
    set({ profile: updated });
    await persist(updated);
  },

  setVadNoiseMargin: async (margin: number): Promise<void> => {
    const updated: VoiceProfile = { ...get().profile, vadNoiseMargin: margin };
    set({ profile: updated });
    await persist(updated);
  },

  setAsrKey: async (provider: string, key: string): Promise<void> => {
    const current = get().profile;
    const updated: VoiceProfile = {
      ...current,
      asr: { ...current.asr, keys: { ...current.asr.keys, [provider]: key } },
    };
    set({ profile: updated });
    await persist(updated);
  },

  setTtsKey: async (provider: string, key: string): Promise<void> => {
    const current = get().profile;
    const updated: VoiceProfile = {
      ...current,
      tts: { ...current.tts, keys: { ...current.tts.keys, [provider]: key } },
    };
    set({ profile: updated });
    await persist(updated);
  },

  hydrate: async (): Promise<void> => {
    try {
      const raw = await SecureStore.getItemAsync(VOICE_PROFILE_STORAGE_KEY);
      if (!raw) {
        set({ profile: { ...VOICE_PROFILE_DEFAULTS }, hydrated: true });
        return;
      }
      const parsed = voiceProfileSchema.safeParse(JSON.parse(raw));
      set({
        profile: parsed.success ? (parsed.data as VoiceProfile) : { ...VOICE_PROFILE_DEFAULTS },
        hydrated: true,
      });
    } catch {
      set({ profile: { ...VOICE_PROFILE_DEFAULTS }, hydrated: true });
    }
  },

  reset: async (): Promise<void> => {
    set({ profile: { ...VOICE_PROFILE_DEFAULTS }, hydrated: true });
    await SecureStore.deleteItemAsync(VOICE_PROFILE_STORAGE_KEY);
  },
}));

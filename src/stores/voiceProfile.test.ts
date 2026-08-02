import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { type VoiceProfile } from '@/types/voice';

import { useVoiceProfileStore, VOICE_PROFILE_STORAGE_KEY } from './voiceProfile';

const FULL_PROFILE: VoiceProfile = {
  asr: { provider: 'groq' },
  tts: { provider: 'edge' },
  interruptBehavior: 'stop_speech_and_run',
  endOfSpeechTimeoutMs: 900,
  maxRecordingMs: 60_000,
};

const reset = () =>
  useVoiceProfileStore.setState({
    profile: {
      asr: { provider: 'groq' },
      tts: { provider: 'device' as const },
      interruptBehavior: 'stop_speech_and_run',
      endOfSpeechTimeoutMs: 900,
      maxRecordingMs: 60_000,
    },
    hydrated: false,
  });

describe('voice profile store', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(VOICE_PROFILE_STORAGE_KEY);
    reset();
    jest.clearAllMocks();
  });

  it('starts with free defaults (groq + device voice)', () => {
    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    expect(useVoiceProfileStore.getState().ttsConfig().provider).toBe('device');
  });

  it('stores a voice profile, not a list', async () => {
    await useVoiceProfileStore.getState().setProfile(FULL_PROFILE);
    expect(Array.isArray(useVoiceProfileStore.getState().profile)).toBe(false);
    expect(useVoiceProfileStore.getState().profile).toMatchObject({
      asr: { provider: 'groq' },
      tts: { provider: 'edge' as const },
    });
  });

  it('persists to SecureStore, never AsyncStorage', async () => {
    await useVoiceProfileStore.getState().setProfile(FULL_PROFILE);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      VOICE_PROFILE_STORAGE_KEY,
      expect.stringContaining('groq'),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  /**
   * Phase 11's exit criterion. The existing tests cover the write and the
   * read separately — this closes the loop through the store's own code, so
   * a key entered once survives a restart.
   */
  it('round-trips an entered key through SecureStore', async () => {
    await useVoiceProfileStore.getState().updateAsrConfig({
      provider: 'groq',
      apiKey: 'gsk_entered_by_hand',
    });
    await useVoiceProfileStore.getState().updateTtsConfig({
      provider: 'elevenlabs',
      apiKey: 'el_entered_by_hand',
    });

    // Wipe everything the running app holds, as a relaunch would.
    reset();
    await useVoiceProfileStore.getState().hydrate();

    expect(useVoiceProfileStore.getState().asrConfig().apiKey).toBe(
      'gsk_entered_by_hand',
    );
    expect(useVoiceProfileStore.getState().ttsConfig().apiKey).toBe(
      'el_entered_by_hand',
    );
  });

  /** Voice keys are the user's: SecureStore only, never the plain store. */
  it('writes keys to SecureStore and nowhere else', async () => {
    await useVoiceProfileStore.getState().updateAsrConfig({
      provider: 'groq',
      apiKey: 'gsk_secret',
    });

    const written = (SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1);
    expect(written?.[0]).toBe(VOICE_PROFILE_STORAGE_KEY);
    expect(String(written?.[1])).toContain('gsk_secret');

    const AsyncStorage = jest.requireMock(
      '@react-native-async-storage/async-storage',
    ) as { setItem?: jest.Mock };
    const wroteToAsync = (AsyncStorage.setItem?.mock.calls ?? []).some(
      ([, value]: [string, string]) => String(value).includes('gsk_secret'),
    );
    expect(wroteToAsync).toBe(false);
  });

  it('hydrates a stored profile on boot', async () => {
    await SecureStore.setItemAsync(
      VOICE_PROFILE_STORAGE_KEY,
      JSON.stringify({
        ...FULL_PROFILE,
        asr: { provider: 'groq', apiKey: 'g_key' },
      }),
    );

    await useVoiceProfileStore.getState().hydrate();

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    expect(useVoiceProfileStore.getState().asrConfig().apiKey).toBe('g_key');
    expect(useVoiceProfileStore.getState().hydrated).toBe(true);
  });

  it('hydrates to free defaults when nothing is stored', async () => {
    await useVoiceProfileStore.getState().hydrate();

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    expect(useVoiceProfileStore.getState().ttsConfig().provider).toBe('device');
    expect(useVoiceProfileStore.getState().hydrated).toBe(true);
  });

  it('discards a corrupted stored blob rather than crashing on boot', async () => {
    await SecureStore.setItemAsync(VOICE_PROFILE_STORAGE_KEY, '{not valid');
    await useVoiceProfileStore.getState().hydrate();

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    expect(useVoiceProfileStore.getState().hydrated).toBe(true);
  });

  it('discards a stored blob that fails schema validation', async () => {
    await SecureStore.setItemAsync(
      VOICE_PROFILE_STORAGE_KEY,
      JSON.stringify({ asr: { provider: 'not_a_provider' }, tts: { provider: 'edge' } }),
    );
    await useVoiceProfileStore.getState().hydrate();

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
  });

  it('updates ASR config independently of TTS config', async () => {
    await useVoiceProfileStore.getState().setProfile(FULL_PROFILE);

    await useVoiceProfileStore.getState().updateAsrConfig({
      provider: 'groq',
      apiKey: 'new_key',
    });

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    // The point of the test: changing ASR leaves the stored TTS choice alone.
    expect(useVoiceProfileStore.getState().ttsConfig().provider).toBe('edge');
  });

  it('updates TTS config independently of ASR config', async () => {
    await useVoiceProfileStore.getState().setProfile(FULL_PROFILE);

    await useVoiceProfileStore.getState().updateTtsConfig({
      provider: 'elevenlabs',
      apiKey: 'el_key',
      voiceId: 'voice_x',
    });

    expect(useVoiceProfileStore.getState().ttsConfig().provider).toBe('elevenlabs');
    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
  });

  it('reset clears to free defaults', async () => {
    await useVoiceProfileStore.getState().setProfile({
      ...FULL_PROFILE,
      asr: { provider: 'groq', apiKey: 'g_key' },
    });
    await useVoiceProfileStore.getState().reset();

    expect(useVoiceProfileStore.getState().asrConfig().provider).toBe('groq');
    expect(useVoiceProfileStore.getState().ttsConfig().provider).toBe('device');
  });

  it('reset wipes the stored profile from SecureStore', async () => {
    await useVoiceProfileStore.getState().setProfile(FULL_PROFILE);
    await useVoiceProfileStore.getState().reset();

    await expect(
      SecureStore.getItemAsync(VOICE_PROFILE_STORAGE_KEY),
    ).resolves.toBeNull();
  });

  it('convenience getters return the right values', () => {
    useVoiceProfileStore.setState({
      profile: {
        ...FULL_PROFILE,
        endOfSpeechTimeoutMs: 1200,
        maxRecordingMs: 30_000,
        interruptBehavior: 'stop_speech_only',
      },
    });

    expect(useVoiceProfileStore.getState().endOfSpeechTimeoutMs()).toBe(1200);
    expect(useVoiceProfileStore.getState().maxRecordingMs()).toBe(30_000);
    expect(useVoiceProfileStore.getState().interruptBehavior()).toBe('stop_speech_only');
  });
});

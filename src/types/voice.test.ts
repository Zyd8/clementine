import {
  asrProviderSchema,
  ttsProviderSchema,
  voiceProfileSchema,
  VOICE_PROFILE_DEFAULTS,
} from '@/types/voice';

describe('voice types', () => {
  describe('asrProviderSchema', () => {
    it('accepts groq with no key at the schema level — the provider enforces it', () => {
      const result = asrProviderSchema.safeParse({ provider: 'groq' });
      expect(result.success).toBe(true);
      expect(result.data?.provider).toBe('groq');
      expect(result.data?.apiKey).toBeUndefined();
    });

    it('accepts groq with an apiKey', () => {
      const result = asrProviderSchema.safeParse({
        provider: 'groq',
        apiKey: 'g_abc',
      });
      expect(result.success).toBe(true);
      expect(result.data?.apiKey).toBe('g_abc');
    });

    it('accepts deepgram with an apiKey', () => {
      const result = asrProviderSchema.safeParse({
        provider: 'deepgram',
        apiKey: 'dg_abc',
      });
      expect(result.success).toBe(true);
    });

    it('accepts openai with an apiKey', () => {
      const result = asrProviderSchema.safeParse({
        provider: 'openai',
        apiKey: 'sk-abc',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown provider', () => {
      const result = asrProviderSchema.safeParse({ provider: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('ttsProviderSchema', () => {
    it('accepts edge with no key', () => {
      const result = ttsProviderSchema.safeParse({ provider: 'edge' });
      expect(result.success).toBe(true);
      expect(result.data?.provider).toBe('edge');
      expect(result.data?.apiKey).toBeUndefined();
    });

    it('accepts elevenlabs with apiKey and voiceId', () => {
      const result = ttsProviderSchema.safeParse({
        provider: 'elevenlabs',
        apiKey: 'el_abc',
        voiceId: 'voice_123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.voiceId).toBe('voice_123');
    });

    it('accepts openai with apiKey', () => {
      const result = ttsProviderSchema.safeParse({
        provider: 'openai',
        apiKey: 'sk-abc',
      });
      expect(result.success).toBe(true);
    });

    it('accepts minimax with apiKey and voiceId', () => {
      const result = ttsProviderSchema.safeParse({
        provider: 'minimax',
        apiKey: 'mm_abc',
        voiceId: 'default',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown provider', () => {
      const result = ttsProviderSchema.safeParse({ provider: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('voiceProfileSchema', () => {
    it('defaults to groq ASR + the device TTS voice', () => {
      const result = voiceProfileSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.asr.provider).toBe('groq');
      expect(result.data?.tts.provider).toBe('device');
    });

    it('defaults endOfSpeechTimeoutMs to 900', () => {
      const result = voiceProfileSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.endOfSpeechTimeoutMs).toBe(900);
    });

    it('defaults maxRecordingMs to 60000', () => {
      const result = voiceProfileSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.maxRecordingMs).toBe(60000);
    });

    it('defaults interruptBehavior to stop_speech_and_run', () => {
      const result = voiceProfileSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.interruptBehavior).toBe('stop_speech_and_run');
    });

    it('rejects endOfSpeechTimeoutMs below 100', () => {
      const result = voiceProfileSchema.safeParse({
        endOfSpeechTimeoutMs: 50,
      });
      expect(result.success).toBe(false);
    });

    it('rejects endOfSpeechTimeoutMs above 5000', () => {
      const result = voiceProfileSchema.safeParse({
        endOfSpeechTimeoutMs: 6000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects maxRecordingMs above 300000 (5 min)', () => {
      const result = voiceProfileSchema.safeParse({
        maxRecordingMs: 300001,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('VOICE_PROFILE_DEFAULTS', () => {
    it('is free-first: groq ASR + the device voice', () => {
      expect(VOICE_PROFILE_DEFAULTS.asr.provider).toBe('groq');
      expect(VOICE_PROFILE_DEFAULTS.tts.provider).toBe('device');
    });
  });
});

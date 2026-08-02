import { DEFAULT_MINIMAX_VOICE, MINIMAX_VOICES } from './minimaxVoices';

describe('minimaxVoices', () => {
  it('declares every voice id exactly once', () => {
    const ids = MINIMAX_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** The picker highlights the default when the profile carries no voice. */
  it('includes the provider default', () => {
    expect(MINIMAX_VOICES.some((v) => v.id === DEFAULT_MINIMAX_VOICE)).toBe(true);
  });

  it('labels every voice', () => {
    for (const voice of MINIMAX_VOICES) {
      expect(voice.label.length).toBeGreaterThan(0);
    }
  });
});

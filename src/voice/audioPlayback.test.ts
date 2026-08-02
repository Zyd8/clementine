import { createAudioPlayer } from 'expo-audio';

import { createMp3Playback } from './audioPlayback';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  (createAudioPlayer as jest.Mock).mockClear();
});

describe('createMp3Playback', () => {
  it('writes the bytes to a cache file and plays that file', async () => {
    const playback = createMp3Playback('minimax-tts');

    await playback.play(new Uint8Array([1, 2, 3]));

    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    const uri = (createAudioPlayer as jest.Mock).mock.calls[0]![0] as string;
    expect(uri).toContain('minimax-tts');
    expect(uri).toMatch(/\.mp3$/);
    const player = (createAudioPlayer as jest.Mock).mock.results[0]?.value;
    expect(player.play).toHaveBeenCalled();
  });

  /**
   * The whole contract: resolve when the audio has actually finished, not
   * when it was handed to the player. A provider that resolves early reports
   * the reply spoken while it is still playing — or, worse, while silent.
   */
  it('resolves only once playback finishes', async () => {
    const playback = createMp3Playback('edge-tts');
    let finished = false;

    const done = playback.play(new Uint8Array([1])).then(() => {
      finished = true;
    });

    expect(finished).toBe(false);
    await done;
    expect(finished).toBe(true);
  });

  it('reports playing between the start and the end of a clip', async () => {
    const playback = createMp3Playback('edge-tts');
    expect(playback.isPlaying()).toBe(false);

    const done = playback.play(new Uint8Array([1]));
    expect(playback.isPlaying()).toBe(true);

    await done;
    expect(playback.isPlaying()).toBe(false);
  });

  it('tears the native player down on stop', async () => {
    const playback = createMp3Playback('edge-tts');
    void playback.play(new Uint8Array([1]));
    const player = (createAudioPlayer as jest.Mock).mock.results[0]?.value;

    playback.stop();

    expect(player.pause).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(playback.isPlaying()).toBe(false);
  });

  /** A second stop, or a stop after the clip ended, must not throw. */
  it('survives being stopped twice', async () => {
    const playback = createMp3Playback('edge-tts');
    await playback.play(new Uint8Array([1]));

    expect(() => {
      playback.stop();
      playback.stop();
    }).not.toThrow();
  });

  /**
   * A stopped clip resolves rather than hanging — the provider awaits it, and
   * an unresolved promise would strand the turn in PLAYING forever.
   */
  it('resolves the pending clip when stopped mid-playback', async () => {
    const playback = createMp3Playback('edge-tts');
    const player = () => (createAudioPlayer as jest.Mock).mock.results[0]?.value;

    const done = playback.play(new Uint8Array([1]));
    // Stop before the mock player emits didJustFinish.
    playback.stop();
    await expect(done).resolves.toBeUndefined();
    expect(player().remove).toHaveBeenCalled();
  });

  it('gives each clip its own file so a stale one is never replayed', async () => {
    const playback = createMp3Playback('edge-tts');
    await playback.play(new Uint8Array([1]));
    await playback.play(new Uint8Array([2]));
    await flush();

    const first = (createAudioPlayer as jest.Mock).mock.calls[0]![0] as string;
    const second = (createAudioPlayer as jest.Mock).mock.calls[1]![0] as string;
    expect(first).not.toBe(second);
  });
});

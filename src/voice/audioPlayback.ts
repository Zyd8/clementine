import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Play synthesized speech that arrived as bytes.
 *
 * Every cloud TTS provider ends the same way: it has an MP3 in memory and
 * needs it heard. `expo-audio` plays from a URI rather than a buffer, so the
 * clip has to be written to the cache first. That sequence — and the native
 * handle lifecycle around it — is identical for Edge and MiniMax, so it lives
 * here rather than being copied into each provider.
 *
 * The contract that matters: `play()` resolves when the audio has actually
 * FINISHED, not when it was handed to the player. Providers await it to know
 * when a sentence is spoken, and resolving early is how a reply gets reported
 * as spoken while the phone is still silent.
 */

const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate' as const;

/** Hermes has no crypto.randomUUID; a collision-free-enough name is all this needs. */
const clipName = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.mp3`;

export type Mp3Playback = {
  /** Write the clip and play it. Resolves when playback ends — or is stopped. */
  play: (bytes: Uint8Array) => Promise<void>;
  /** Cut playback short. Safe to call twice, or after the clip ended. */
  stop: () => void;
  isPlaying: () => boolean;
};

/**
 * @param dirName Cache subdirectory, one per provider, so a stale clip is
 *   traceable to whoever wrote it.
 */
export function createMp3Playback(dirName: string): Mp3Playback {
  let player: AudioPlayer | null = null;
  let playing = false;
  /** Resolves the in-flight `play()` when a stop pre-empts didJustFinish. */
  let endCurrent: (() => void) | null = null;

  const teardown = (): void => {
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        /* the native handle may already be gone */
      }
      player = null;
    }
    playing = false;
  };

  return {
    play: async (bytes: Uint8Array): Promise<void> => {
      const dir = new Directory(Paths.cache, dirName);
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, clipName());
      file.create();
      file.write(bytes);

      playing = true;
      player = createAudioPlayer(file.uri);

      await new Promise<void>((resolve) => {
        // Either path resolves exactly once: the clip ends, or a stop cuts it
        // short. Leaving it unresolved would strand the turn in PLAYING.
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          endCurrent = null;
          teardown();
          resolve();
        };

        endCurrent = finish;

        const onStatus = (status: AudioStatus) => {
          if (status.didJustFinish) finish();
        };
        player?.addListener(PLAYBACK_STATUS_UPDATE, onStatus as never);

        try {
          player?.play();
        } catch {
          // A player that will not start is a finished clip as far as the
          // caller is concerned — the provider surfaces the silence itself.
          finish();
        }
      });
    },

    stop: (): void => {
      const pending = endCurrent;
      endCurrent = null;
      if (pending) {
        pending();
        return;
      }
      teardown();
    },

    isPlaying: (): boolean => playing,
  };
}

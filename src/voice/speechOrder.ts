/**
 * Keeps spoken sentences in the order they were handed over.
 *
 * The agent's reply is streamed, and `sentenceBuffer` closes one sentence at a
 * time. Each is sent to the TTS provider fire-and-forget, so playback can
 * start before the reply has finished arriving — that part is deliberate.
 *
 * What it must not do is play them all at once. Without a gate, sentence two
 * reaches the audio player while sentence one is still audible, and a
 * three-sentence reply comes out as three overlapping voices.
 *
 * A turn is taken when the sentence arrives and released when it has been
 * spoken, so the queue reflects arrival order — NOT the order synthesis
 * happened to finish in, which varies with sentence length and network luck.
 * Synthesis still runs in parallel; only playback is serialized.
 */

export type SpeechTurn = {
  /** Resolves when every earlier turn has been released. */
  wait: Promise<void>;
  /** Hand over to the next turn. Safe to call twice. */
  release: () => void;
};

export type SpeechOrder = {
  take: () => SpeechTurn;
  /** Abandon the queue — for a stop, where pending sentences are dropped. */
  reset: () => void;
};

export function createSpeechOrder(): SpeechOrder {
  let tail: Promise<void> = Promise.resolve();

  return {
    take: (): SpeechTurn => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      // `previous` is only ever resolved, never rejected, so a failed sentence
      // releases its turn in a `finally` and the queue keeps moving.
      return { wait: previous, release };
    },

    reset: (): void => {
      tail = Promise.resolve();
    },
  };
}

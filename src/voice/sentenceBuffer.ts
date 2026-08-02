/**
 * Sentence-chunked buffering for streaming TTS.
 *
 * Accumulates agent text from SSE deltas, cuts at `.`, `!`, `?`, and newline
 * boundaries, and emits complete sentences for TTS synthesis. Partial trailing
 * text is held until the boundary arrives or `flush()` is called — no premature
 * cuts, no chopped half-sentences.
 *
 * This is the key to the ~1-2s first-audio feel: we don't wait for the whole
 * reply (feels dead) and we don't synthesize broken mid-word chunks (sounds
 * robotic).
 */

export type SentenceBuffer = {
  /** Feed agent text; the callback fires once per completed sentence. */
  push: (text: string, onSentence: (sentence: string) => void) => void;
  /** Emit whatever remains, even if there's no boundary. */
  flush: (onSentence: (sentence: string) => void) => void;
  /** Discard everything without emitting. */
  reset: () => void;
};

const SENTENCE_BOUNDARY = /[.!?\n]/;

export function createSentenceBuffer(): SentenceBuffer {
  let buffer = '';

  const extract = (onSentence: (sentence: string) => void): void => {
    // Walk the buffer, emitting on each sentence boundary.
    let idx = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (SENTENCE_BOUNDARY.test(buffer[i]!)) {
        const sentence = buffer.slice(idx, i + 1);
        onSentence(sentence);
        idx = i + 1;
      }
    }
    buffer = buffer.slice(idx);
  };

  return {
    push: (text: string, onSentence: (sentence: string) => void): void => {
      buffer += text;
      extract(onSentence);
    },

    flush: (onSentence: (sentence: string) => void): void => {
      if (buffer.length > 0) {
        onSentence(buffer);
        buffer = '';
      }
    },

    reset: (): void => {
      buffer = '';
    },
  };
}

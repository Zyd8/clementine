import { createSentenceBuffer, type SentenceBuffer } from '@/voice/sentenceBuffer';

describe('sentenceBuffer', () => {
  let buf: SentenceBuffer;

  beforeEach(() => {
    buf = createSentenceBuffer();
  });

  describe('sentence boundaries', () => {
    it('emits a sentence when a period is reached', () => {
      const sentences: string[] = [];
      buf.push('Hello world.', (s) => sentences.push(s));

      expect(sentences).toEqual(['Hello world.']);
    });

    it('emits a sentence on exclamation mark', () => {
      const sentences: string[] = [];
      buf.push('That is amazing!', (s) => sentences.push(s));

      expect(sentences).toEqual(['That is amazing!']);
    });

    it('emits a sentence on question mark', () => {
      const sentences: string[] = [];
      buf.push('How are you?', (s) => sentences.push(s));

      expect(sentences).toEqual(['How are you?']);
    });

    it('emits a sentence on newline (treats as boundary)', () => {
      const sentences: string[] = [];
      buf.push('First line\n', (s) => sentences.push(s));

      expect(sentences).toEqual(['First line\n']);
    });

    it('does NOT emit on comma', () => {
      const sentences: string[] = [];
      buf.push('One, two, three.', (s) => sentences.push(s));

      expect(sentences).toEqual(['One, two, three.']);
      expect(sentences.length).toBe(1);
    });

    it('does NOT emit on a comma mid-stream', () => {
      const half: string[] = [];
      buf.push('Hello,', (s) => half.push(s));
      expect(half).toEqual([]);

      const full: string[] = [];
      buf.push(' world!', (s) => full.push(s));
      expect(full).toEqual(['Hello, world!']);
    });

    it('handles multiple sentences in one push', () => {
      const sentences: string[] = [];
      buf.push('Hi. How are you? I am fine!', (s) => sentences.push(s));

      expect(sentences).toEqual(['Hi.', ' How are you?', ' I am fine!']);
    });
  });

  describe('streaming partial input', () => {
    it('holds a partial sentence until the boundary arrives', () => {
      const half: string[] = [];
      buf.push('I am', (s) => half.push(s));
      expect(half).toEqual([]);

      const rest: string[] = [];
      buf.push(' fine.', (s) => rest.push(s));
      expect(rest).toEqual(['I am fine.']);
    });

    it('does not emit a sentence when mid-stream text has no boundary', () => {
      const results: string[] = [];
      buf.push('The quick brown fox', (s) => results.push(s));

      expect(results).toEqual([]);
    });

    it('accumulates across many pushes then emits at the boundary', () => {
      const all: string[] = [];
      buf.push('This', (s) => all.push(s));
      buf.push(' is', (s) => all.push(s));
      buf.push(' a', (s) => all.push(s));
      buf.push(' sentence.', (s) => all.push(s));

      expect(all).toEqual(['This is a sentence.']);
    });

    it('never emits duplicate text for a partial followed by boundary', () => {
      const all: string[] = [];
      buf.push('Part', (s) => all.push(s));
      buf.push('ial.', (s) => all.push(s));

      expect(all).toEqual(['Partial.']);
      // No cruft before the real sentence
      expect(all.every((s) => s.length > 2)).toBe(true);
    });
  });

  describe('flush', () => {
    it('emits remaining partial text on flush even without a boundary', () => {
      const all: string[] = [];
      buf.push('Unfinished thought', (s) => all.push(s));
      buf.flush((s) => all.push(s));

      expect(all).toEqual(['Unfinished thought']);
    });

    it('does not emit a second time if already emitted at boundary', () => {
      const all: string[] = [];
      buf.push('Done.', (s) => all.push(s));
      buf.flush((s) => all.push(s));

      expect(all).toEqual(['Done.']);
    });

    it('emits nothing on flush if buffer is empty', () => {
      const all: string[] = [];
      buf.flush((s) => all.push(s));

      expect(all).toEqual([]);
    });

    it('clears the buffer after flush', () => {
      const first: string[] = [];
      buf.push('Trailing', (s) => first.push(s));
      buf.flush((s) => first.push(s));
      expect(first).toEqual(['Trailing']);

      const second: string[] = [];
      buf.flush((s) => second.push(s));
      expect(second).toEqual([]);
    });
  });

  describe('reset', () => {
    it('clears the buffer without emitting', () => {
      const all: string[] = [];
      buf.push('Forgotten text', (s) => all.push(s));
      buf.reset();

      buf.flush((s) => all.push(s));
      expect(all).toEqual([]);
    });

    it('allows fresh accumulation after reset', () => {
      buf.push('Old.', () => {});
      buf.reset();

      const sentences: string[] = [];
      buf.push('New.', (s) => sentences.push(s));
      expect(sentences).toEqual(['New.']);
    });
  });
});

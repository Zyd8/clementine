/**
 * Incremental SSE frame parser.
 *
 * Built on plain string chunks rather than `EventSource` because React
 * Native's `EventSource` cannot send an Authorization header — and every
 * Hermes request needs one. The parser is deliberately separate from the
 * transport so it can be tested against a byte-at-a-time feed of a real
 * captured stream (see `__fixtures__/live-run-events.txt`).
 *
 * Hermes sends bare `data:` frames with the event name *inside* the JSON,
 * and closes with a `: stream closed` comment.
 */

export type SseFrame = {
  data: string;
  event?: string;
  id?: string;
};

type Accumulator = { data: string[]; event?: string; id?: string };

const emptyAccumulator = (): Accumulator => ({ data: [] });

export type SseParser = {
  /** Feed a chunk; returns every frame completed by it. */
  push: (chunk: string) => SseFrame[];
  /** Emit a trailing frame that never received its blank-line terminator. */
  flush: () => SseFrame[];
};

export function createSseParser(): SseParser {
  let buffer = '';
  let current = emptyAccumulator();

  const complete = (): SseFrame | null => {
    const { data, event, id } = current;
    current = emptyAccumulator();
    // A frame with no data field carries nothing renderable — drop it.
    if (data.length === 0) return null;
    return {
      data: data.join('\n'),
      ...(event === undefined ? {} : { event }),
      ...(id === undefined ? {} : { id }),
    };
  };

  const consumeLine = (line: string): SseFrame | null => {
    // Blank line terminates the current frame.
    if (line === '') return complete();
    // Comments (": stream closed", keep-alives) are ignored entirely.
    if (line.startsWith(':')) return null;

    const colon = line.indexOf(':');
    // A line with no colon is malformed; skip it rather than throwing.
    if (colon === -1) return null;

    const field = line.slice(0, colon);
    // One optional leading space after the colon is stripped, per the spec.
    const value = line.slice(colon + 1).replace(/^ /, '');

    if (field === 'data') current.data.push(value);
    else if (field === 'event') current.event = value;
    else if (field === 'id') current.id = value;
    return null;
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      const frames: SseFrame[] = [];

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const frame = consumeLine(line);
        if (frame) frames.push(frame);
        newline = buffer.indexOf('\n');
      }
      return frames;
    },

    flush: () => {
      // Whatever is left has no terminator; treat it as a final line.
      if (buffer.length > 0) {
        consumeLine(buffer.replace(/\r$/, ''));
        buffer = '';
      }
      const frame = complete();
      return frame ? [frame] : [];
    },
  };
}

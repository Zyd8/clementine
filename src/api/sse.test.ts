import { createSseParser } from './sse';

describe('createSseParser', () => {
  it('parses a single complete frame', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":1}\n\n')).toEqual([{ data: '{"a":1}' }]);
  });

  it('emits nothing until the frame terminator arrives', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":1}')).toEqual([]);
    expect(parser.push('\n\n')).toEqual([{ data: '{"a":1}' }]);
  });

  it('reassembles a frame split mid-JSON across reads', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"ev')).toEqual([]);
    expect(parser.push('ent":"message.delta"')).toEqual([]);
    expect(parser.push('}\n\n')).toEqual([{ data: '{"event":"message.delta"}' }]);
  });

  it('parses several frames arriving in one chunk', () => {
    const parser = createSseParser();
    expect(parser.push('data: 1\n\ndata: 2\n\n')).toEqual([{ data: '1' }, { data: '2' }]);
  });

  it('handles a chunk boundary that lands inside the blank-line terminator', () => {
    const parser = createSseParser();
    expect(parser.push('data: 1\n')).toEqual([]);
    expect(parser.push('\ndata: 2\n\n')).toEqual([{ data: '1' }, { data: '2' }]);
  });

  it('accepts CRLF line endings', () => {
    const parser = createSseParser();
    expect(parser.push('data: 1\r\n\r\n')).toEqual([{ data: '1' }]);
  });

  it('joins multiple data lines in one frame with newlines, per the SSE spec', () => {
    const parser = createSseParser();
    expect(parser.push('data: line1\ndata: line2\n\n')).toEqual([
      { data: 'line1\nline2' },
    ]);
  });

  it('captures a named event field when the server sends one', () => {
    const parser = createSseParser();
    expect(parser.push('event: ping\ndata: {}\n\n')).toEqual([
      { data: '{}', event: 'ping' },
    ]);
  });

  it('captures an id field so reconnect could use Last-Event-ID if it ever lands', () => {
    const parser = createSseParser();
    expect(parser.push('id: 42\ndata: {}\n\n')).toEqual([{ data: '{}', id: '42' }]);
  });

  it('ignores comment lines — Hermes ends its stream with ": stream closed"', () => {
    const parser = createSseParser();
    expect(parser.push(': stream closed\n\n')).toEqual([]);
  });

  it('ignores a comment that shares a frame with real data', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\ndata: 1\n\n')).toEqual([{ data: '1' }]);
  });

  it('tolerates a field with no space after the colon', () => {
    const parser = createSseParser();
    expect(parser.push('data:1\n\n')).toEqual([{ data: '1' }]);
  });

  it('does not crash on a malformed line with no colon at all', () => {
    const parser = createSseParser();
    expect(() => parser.push('garbage\n\n')).not.toThrow();
  });

  it('drops a frame that carried no data field', () => {
    const parser = createSseParser();
    expect(parser.push('event: ping\n\n')).toEqual([]);
  });

  it('keeps parsing correctly after a malformed frame', () => {
    const parser = createSseParser();
    parser.push('garbage\n\n');
    expect(parser.push('data: 1\n\n')).toEqual([{ data: '1' }]);
  });

  it('surfaces a trailing frame that never got its terminator, on flush', () => {
    const parser = createSseParser();
    parser.push('data: 1');
    expect(parser.flush()).toEqual([{ data: '1' }]);
  });

  it('flushes nothing when the buffer is empty', () => {
    expect(createSseParser().flush()).toEqual([]);
  });

  it('parses the captured live Hermes stream end to end', () => {
    const raw = require('fs').readFileSync(
      require('path').join(__dirname, '__fixtures__/live-run-events.txt'),
      'utf8',
    ) as string;
    const parser = createSseParser();
    const events = parser
      .push(raw)
      .concat(parser.flush())
      .map((frame) => JSON.parse(frame.data).event as string);

    expect(events).toEqual([
      'tool.started',
      'tool.completed',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.delta',
      'reasoning.available',
      'run.completed',
    ]);
  });

  it('parses the live stream identically when fed one byte at a time', () => {
    const raw = require('fs').readFileSync(
      require('path').join(__dirname, '__fixtures__/live-run-events.txt'),
      'utf8',
    ) as string;
    const parser = createSseParser();
    const frames = [...raw].flatMap((char) => parser.push(char)).concat(parser.flush());
    expect(frames).toHaveLength(8);
  });
});

import { normalizeEvent } from './events';

describe('normalizeEvent — real Hermes wire shapes', () => {
  it('maps message.delta to assistant.delta (the wire name is not the app name)', () => {
    expect(
      normalizeEvent({ event: 'message.delta', run_id: 'r1', delta: 'OK' }),
    ).toEqual({ type: 'assistant.delta', text: 'OK' });
  });

  it('preserves whitespace in a delta — deltas concatenate verbatim', () => {
    expect(
      normalizeEvent({ event: 'message.delta', run_id: 'r1', delta: '\n\nhello' }),
    ).toEqual({ type: 'assistant.delta', text: '\n\nhello' });
  });

  it('drops a delta with no text rather than emitting an empty bubble', () => {
    expect(normalizeEvent({ event: 'message.delta', run_id: 'r1' })).toBeNull();
  });

  it('maps tool.started, reading the command from `preview`, not `args`', () => {
    expect(
      normalizeEvent({
        event: 'tool.started',
        run_id: 'r1',
        tool: 'terminal',
        preview: 'echo hello-clementine',
      }),
    ).toEqual({
      type: 'tool.started',
      tool: 'terminal',
      args: 'echo hello-clementine',
    });
  });

  it('tolerates tool.started with no preview', () => {
    expect(
      normalizeEvent({ event: 'tool.started', run_id: 'r1', tool: 'terminal' }),
    ).toEqual({ type: 'tool.started', tool: 'terminal', args: '' });
  });

  it('INVERTS `error: false` into ok: true — the wire flag is the opposite of ours', () => {
    expect(
      normalizeEvent({
        event: 'tool.completed',
        run_id: 'r1',
        tool: 'terminal',
        duration: 0.102,
        error: false,
      }),
    ).toMatchObject({ type: 'tool.completed', tool: 'terminal', ok: true });
  });

  it('treats `error: true` as a failed tool call', () => {
    expect(
      normalizeEvent({
        event: 'tool.completed',
        run_id: 'r1',
        tool: 'terminal',
        error: true,
      }),
    ).toMatchObject({ type: 'tool.completed', ok: false });
  });

  it('carries the duration through in milliseconds — the wire sends seconds', () => {
    expect(
      normalizeEvent({
        event: 'tool.completed',
        run_id: 'r1',
        tool: 'terminal',
        duration: 0.102,
        error: false,
      }),
    ).toMatchObject({ durationMs: 102 });
  });

  it('defaults a missing error flag to success rather than crying wolf', () => {
    expect(
      normalizeEvent({ event: 'tool.completed', run_id: 'r1', tool: 'terminal' }),
    ).toMatchObject({ ok: true });
  });

  it('maps run.completed with its output', () => {
    expect(
      normalizeEvent({
        event: 'run.completed',
        run_id: 'r1',
        output: 'hello-clementine',
        usage: { input_tokens: 32546, output_tokens: 71, total_tokens: 32617 },
      }),
    ).toMatchObject({ type: 'run.completed', output: 'hello-clementine' });
  });

  it('normalizes snake_case usage into the app’s camelCase shape', () => {
    expect(
      normalizeEvent({
        event: 'run.completed',
        run_id: 'r1',
        output: 'x',
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      }),
    ).toMatchObject({
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
  });

  it('handles run.completed with no usage block', () => {
    const event = normalizeEvent({ event: 'run.completed', run_id: 'r1', output: 'x' });
    expect(event).toMatchObject({ type: 'run.completed', output: 'x' });
    expect((event as { usage?: unknown }).usage).toBeUndefined();
  });

  it('maps run.failed to an error event', () => {
    expect(
      normalizeEvent({ event: 'run.failed', run_id: 'r1', error: 'boom' }),
    ).toMatchObject({ type: 'run.failed', message: 'boom' });
  });

  it('ignores reasoning.available — it duplicates text already streamed as deltas', () => {
    // Confirmed against a live run: `reasoning.available.text` repeats the
    // concatenated deltas verbatim. Rendering it would double every reply.
    expect(
      normalizeEvent({ event: 'reasoning.available', run_id: 'r1', text: 'OK.' }),
    ).toBeNull();
  });

  it('ignores an unknown future event instead of throwing', () => {
    expect(normalizeEvent({ event: 'some.new.thing', run_id: 'r1' })).toBeNull();
  });

  it('ignores a payload with no event discriminator', () => {
    expect(normalizeEvent({ run_id: 'r1' })).toBeNull();
  });

  it('ignores a non-object payload', () => {
    expect(normalizeEvent('nope')).toBeNull();
    expect(normalizeEvent(null)).toBeNull();
  });

  it('ignores a payload whose fields have the wrong types', () => {
    expect(normalizeEvent({ event: 'message.delta', delta: 42 })).toBeNull();
  });
});

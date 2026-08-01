import { profileKey, useChatStore } from './chat';

const P = null; // no profiles on any shipping Hermes yet — the `null` slot

describe('profileKey', () => {
  it('maps the no-profile case to a stable key', () => {
    expect(profileKey(null)).toBe(profileKey(null));
  });

  it('keeps distinct profiles in distinct namespaces', () => {
    expect(profileKey('a')).not.toBe(profileKey('b'));
  });

  it('never collides a real profile id with the null slot', () => {
    expect(profileKey('default')).not.toBe(profileKey(null));
  });
});

describe('chat store', () => {
  beforeEach(() => useChatStore.getState().reset(P));

  const feed = () => useChatStore.getState().feed(P);

  it('starts empty', () => {
    expect(feed()).toEqual([]);
  });

  it('appends the user message optimistically — the only optimistic render', () => {
    useChatStore.getState().appendUserMessage(P, 'hello');
    expect(feed()).toMatchObject([{ kind: 'user', text: 'hello' }]);
  });

  it('opens an assistant bubble on the first delta', () => {
    useChatStore.getState().applyEvent(P, { type: 'assistant.delta', text: 'He' });
    expect(feed()).toMatchObject([{ kind: 'assistant', text: 'He', streaming: true }]);
  });

  it('accumulates deltas into one bubble rather than many', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'assistant.delta', text: 'He' });
    applyEvent(P, { type: 'assistant.delta', text: 'llo' });
    expect(feed()).toHaveLength(1);
    expect(feed()[0]).toMatchObject({ text: 'Hello' });
  });

  it('preserves whitespace exactly when concatenating deltas', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'assistant.delta', text: 'a' });
    applyEvent(P, { type: 'assistant.delta', text: '\n\nb' });
    expect(feed()[0]).toMatchObject({ text: 'a\n\nb' });
  });

  it('renders a tool call as its own feed item, interleaved like a REPL', () => {
    const { appendUserMessage, applyEvent } = useChatStore.getState();
    appendUserMessage(P, 'run it');
    applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'echo hi' });
    expect(feed()).toMatchObject([
      { kind: 'user' },
      { kind: 'tool', tool: 'terminal', args: 'echo hi', status: 'running' },
    ]);
  });

  it('flips the matching tool card to ok on completion', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'echo hi' });
    applyEvent(P, { type: 'tool.completed', tool: 'terminal', ok: true, durationMs: 102 });
    expect(feed()[0]).toMatchObject({ status: 'ok', durationMs: 102 });
  });

  it('flips a failed tool call to error', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'bad' });
    applyEvent(P, { type: 'tool.completed', tool: 'terminal', ok: false });
    expect(feed()[0]).toMatchObject({ status: 'error' });
  });

  it('completes the oldest running call of that tool, not a newer one', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'first' });
    applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'second' });
    applyEvent(P, { type: 'tool.completed', tool: 'terminal', ok: true });
    expect(feed()).toMatchObject([
      { args: 'first', status: 'ok' },
      { args: 'second', status: 'running' },
    ]);
  });

  it('ignores a completion for a tool that never started', () => {
    useChatStore
      .getState()
      .applyEvent(P, { type: 'tool.completed', tool: 'ghost', ok: true });
    expect(feed()).toEqual([]);
  });

  it('closes the streaming bubble on run.completed', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'assistant.delta', text: 'Hello' });
    applyEvent(P, { type: 'run.completed', output: 'Hello' });
    expect(feed()[0]).toMatchObject({ streaming: false });
  });

  it('does not duplicate text when run.completed repeats the streamed output', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'assistant.delta', text: 'hello-clementine' });
    applyEvent(P, { type: 'run.completed', output: 'hello-clementine' });
    expect(feed()).toHaveLength(1);
    expect(feed()[0]).toMatchObject({ text: 'hello-clementine' });
  });

  it('falls back to the final output when no deltas ever arrived', () => {
    useChatStore.getState().applyEvent(P, { type: 'run.completed', output: 'only' });
    expect(feed()).toMatchObject([{ kind: 'assistant', text: 'only', streaming: false }]);
  });

  it('records usage from run.completed instead of discarding it', () => {
    useChatStore.getState().applyEvent(P, {
      type: 'run.completed',
      output: 'x',
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
    expect(useChatStore.getState().usage(P)).toMatchObject({ totalTokens: 12 });
  });

  it('accumulates usage across runs', () => {
    const { applyEvent } = useChatStore.getState();
    const usage = { inputTokens: 10, outputTokens: 2, totalTokens: 12 };
    applyEvent(P, { type: 'run.completed', output: 'a', usage });
    applyEvent(P, { type: 'run.completed', output: 'b', usage });
    expect(useChatStore.getState().usage(P)).toMatchObject({ totalTokens: 24 });
  });

  it('renders a failed run as an error item carrying the reason', () => {
    useChatStore.getState().applyEvent(P, { type: 'run.failed', message: 'boom' });
    expect(feed()).toMatchObject([{ kind: 'error', text: 'boom' }]);
  });

  it('stops a streaming bubble when the run fails mid-stream', () => {
    const { applyEvent } = useChatStore.getState();
    applyEvent(P, { type: 'assistant.delta', text: 'partial' });
    applyEvent(P, { type: 'run.failed', message: 'boom' });
    expect(feed()[0]).toMatchObject({ kind: 'assistant', streaming: false });
  });

  describe('profile isolation — built now so nothing needs a re-key later', () => {
    beforeEach(() => {
      useChatStore.getState().reset(null);
      useChatStore.getState().reset('work');
    });

    it('keeps two profiles’ feeds completely separate', () => {
      useChatStore.getState().appendUserMessage(null, 'personal');
      useChatStore.getState().appendUserMessage('work', 'work thing');
      expect(useChatStore.getState().feed(null)).toHaveLength(1);
      expect(useChatStore.getState().feed('work')).toMatchObject([
        { text: 'work thing' },
      ]);
    });

    it('never cross-talks deltas between profiles mid-stream', () => {
      useChatStore.getState().applyEvent(null, { type: 'assistant.delta', text: 'a' });
      useChatStore.getState().applyEvent('work', { type: 'assistant.delta', text: 'b' });
      expect(useChatStore.getState().feed(null)[0]).toMatchObject({ text: 'a' });
      expect(useChatStore.getState().feed('work')[0]).toMatchObject({ text: 'b' });
    });

    it('tracks usage per profile', () => {
      const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
      useChatStore.getState().applyEvent('work', { type: 'run.completed', output: 'x', usage });
      expect(useChatStore.getState().usage('work')).toMatchObject({ totalTokens: 2 });
      expect(useChatStore.getState().usage(null)).toMatchObject({ totalTokens: 0 });
    });

    it('resets one profile without touching the other', () => {
      useChatStore.getState().appendUserMessage(null, 'keep me');
      useChatStore.getState().appendUserMessage('work', 'drop me');
      useChatStore.getState().reset('work');
      expect(useChatStore.getState().feed(null)).toHaveLength(1);
      expect(useChatStore.getState().feed('work')).toHaveLength(0);
    });
  });

  describe('reconcileCompletion — replaces a partial bubble after a dropped stream', () => {
    it('replaces the partially streamed text with the authoritative output', () => {
      const { applyEvent, reconcileCompletion } = useChatStore.getState();
      applyEvent(P, { type: 'assistant.delta', text: 'par' });
      reconcileCompletion(P, 'partial then rest');
      expect(feed()).toMatchObject([
        { kind: 'assistant', text: 'partial then rest', streaming: false },
      ]);
    });

    it('leaves exactly one assistant bubble — no duplicated text', () => {
      const { applyEvent, reconcileCompletion } = useChatStore.getState();
      applyEvent(P, { type: 'assistant.delta', text: 'par' });
      reconcileCompletion(P, 'partial then rest');
      expect(feed().filter((item) => item.kind === 'assistant')).toHaveLength(1);
    });

    it('keeps the user message and any tool cards that already rendered', () => {
      const store = useChatStore.getState();
      store.appendUserMessage(P, 'do it');
      store.applyEvent(P, { type: 'tool.started', tool: 'terminal', args: 'x' });
      store.applyEvent(P, { type: 'tool.completed', tool: 'terminal', ok: true });
      store.applyEvent(P, { type: 'assistant.delta', text: 'par' });
      store.reconcileCompletion(P, 'full answer');

      expect(feed().map((item) => item.kind)).toEqual(['user', 'tool', 'assistant']);
    });

    it('adds the answer when the stream dropped before any delta arrived', () => {
      useChatStore.getState().reconcileCompletion(P, 'full answer');
      expect(feed()).toMatchObject([{ kind: 'assistant', text: 'full answer' }]);
    });

    it('records usage reported by the reconciling poll', () => {
      useChatStore.getState().reconcileCompletion(P, 'x', {
        inputTokens: 5,
        outputTokens: 1,
        totalTokens: 6,
      });
      expect(useChatStore.getState().usage(P)).toMatchObject({ totalTokens: 6 });
    });

    it('clears the active run', () => {
      useChatStore.getState().setActiveRun(P, 'run_abc');
      useChatStore.getState().reconcileCompletion(P, 'x');
      expect(useChatStore.getState().activeRun(P)).toBeNull();
    });
  });

  describe('in-flight run tracking', () => {
    it('has no active run initially', () => {
      expect(useChatStore.getState().activeRun(P)).toBeNull();
    });

    it('records the active run id', () => {
      useChatStore.getState().setActiveRun(P, 'run_abc');
      expect(useChatStore.getState().activeRun(P)).toBe('run_abc');
    });

    it('clears the active run when it ends', () => {
      useChatStore.getState().setActiveRun(P, 'run_abc');
      useChatStore.getState().setActiveRun(P, null);
      expect(useChatStore.getState().activeRun(P)).toBeNull();
    });
  });
});

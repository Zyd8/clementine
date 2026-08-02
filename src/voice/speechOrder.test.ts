import { createSpeechOrder } from './speechOrder';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createSpeechOrder', () => {
  it('lets the first caller straight through', async () => {
    const order = createSpeechOrder();
    const turn = order.take();

    await expect(turn.wait).resolves.toBeUndefined();
    turn.release();
  });

  /**
   * The bug this exists for: sentences are spoken fire-and-forget as they
   * stream in, so without a gate the second and third reach the player while
   * the first is still audible — three voices at once.
   */
  it('holds the second caller until the first releases', async () => {
    const order = createSpeechOrder();
    const spoken: string[] = [];

    const first = order.take();
    const second = order.take();

    void second.wait.then(() => spoken.push('second'));
    await first.wait;
    spoken.push('first');

    await tick();
    expect(spoken).toEqual(['first']);

    first.release();
    await tick();
    expect(spoken).toEqual(['first', 'second']);
    second.release();
  });

  /** Order is the order turns were TAKEN, not the order they became ready. */
  it('keeps call order even when later work finishes first', async () => {
    const order = createSpeechOrder();
    const spoken: number[] = [];

    const run = async (n: number, synthesisMs: number) => {
      const turn = order.take();
      // Later sentences may synthesize faster — they still wait their turn.
      await new Promise((r) => setTimeout(r, synthesisMs));
      await turn.wait;
      spoken.push(n);
      turn.release();
    };

    await Promise.all([run(1, 30), run(2, 1), run(3, 10)]);

    expect(spoken).toEqual([1, 2, 3]);
  });

  /**
   * A sentence whose synthesis failed must not wedge the queue — everything
   * behind it would go silent while the turn still reported itself spoken.
   */
  it('does not strand the queue when a caller fails', async () => {
    const order = createSpeechOrder();
    const spoken: string[] = [];

    const failing = order.take();
    const next = order.take();

    // The failing caller releases in its `finally` without ever speaking.
    failing.release();

    await next.wait;
    spoken.push('next');
    next.release();

    expect(spoken).toEqual(['next']);
  });

  it('survives a double release', async () => {
    const order = createSpeechOrder();
    const turn = order.take();

    expect(() => {
      turn.release();
      turn.release();
    }).not.toThrow();

    const after = order.take();
    await expect(after.wait).resolves.toBeUndefined();
  });

  /** Stopping mid-reply drops the queued sentences rather than draining it. */
  it('reset clears the queue so a new reply starts clean', async () => {
    const order = createSpeechOrder();
    const held = order.take();
    order.take(); // never released — a sentence abandoned by a stop

    order.reset();

    const fresh = order.take();
    await expect(fresh.wait).resolves.toBeUndefined();
    held.release();
  });
});

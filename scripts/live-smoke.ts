/**
 * Live smoke test — the app's real API modules against a real Hermes.
 *
 * Not part of `jest` (which never touches the network). Run manually:
 *   CLEMENTINE_BASE_URL=http://127.0.0.1:8642 \
 *   CLEMENTINE_API_KEY=$(grep '^CLEMENTINE_API_KEY=' ~/.hermes/.env | cut -d= -f2-) \
 *   npx tsx scripts/live-smoke.ts
 */
import { validateConnection } from '../src/api/capabilities';
import { createRun, getRun, streamRunEvents } from '../src/api/runs';
import { useChatStore } from '../src/stores/chat';

const baseUrl = process.env.CLEMENTINE_BASE_URL;
const apiKey = process.env.CLEMENTINE_API_KEY;

if (!baseUrl || !apiKey) {
  console.error('Set CLEMENTINE_BASE_URL and CLEMENTINE_API_KEY.');
  process.exit(1);
}

const ok = (label: string, pass: boolean, detail = '') => {
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
};

async function main() {
  console.log('\n1. Connection validation (Phase 2)');
  const caps = await validateConnection(baseUrl!, apiKey!);
  ok('validates against the live instance', caps.platform.startsWith('hermes'), caps.platform);
  ok('reports run support', caps.supportsRuns);
  ok('reports SSE support', caps.supportsSse);
  ok('reports profiles unsupported (Phase 3 blocked)', caps.supportsProfiles === false);

  console.log('\n2. Wrong key is rejected distinguishably (Phase 2)');
  await validateConnection(baseUrl!, 'definitely-not-the-key')
    .then(() => ok('rejects a bad key', false, 'it was accepted!'))
    .catch((e) => ok('rejects a bad key as auth', e.kind === 'auth', e.kind));

  console.log('\n3. Unreachable host is a network error, not an auth error (Phase 2)');
  await validateConnection('http://127.0.0.1:9', apiKey!)
    .then(() => ok('detects unreachable host', false))
    .catch((e) => ok('detects unreachable host', e.kind === 'network', e.kind));

  console.log('\n4. Full turn with a tool call, through the real store (Phase 4)');
  const { runId } = await createRun(baseUrl!, apiKey!, {
    input: 'Run the shell command: echo clementine-live-smoke. Then reply with just its output.',
  });
  ok('created a run', Boolean(runId), runId);

  const store = useChatStore.getState();
  store.reset(null);
  store.appendUserMessage(null, 'echo test');

  let events = 0;
  for await (const event of streamRunEvents(baseUrl!, apiKey!, runId)) {
    events += 1;
    useChatStore.getState().applyEvent(null, event);
  }
  ok('received stream events', events > 0, `${events} events`);

  const feed = useChatStore.getState().feed(null);
  const tools = feed.filter((i) => i.kind === 'tool');
  const replies = feed.filter((i) => i.kind === 'assistant');

  ok('rendered a tool card', tools.length > 0, JSON.stringify(tools[0] ?? null));
  ok('tool card resolved (not stuck running)', tools.every((t: any) => t.status !== 'running'));
  ok('rendered exactly one assistant bubble', replies.length === 1);
  ok('assistant bubble is settled', replies.every((r: any) => r.streaming === false));
  ok(
    'reply contains the command output',
    replies.some((r: any) => r.text.includes('clementine-live-smoke')),
    JSON.stringify(replies[0] ?? null).slice(0, 120),
  );

  const usage = useChatStore.getState().usage(null);
  ok('captured token usage', usage.totalTokens > 0, `${usage.totalTokens} tokens`);

  console.log('\n5. Reconnect reconciliation against the finished run (Phase 4)');
  const state = await getRun(baseUrl!, apiKey!, runId);
  ok('polled run state', state.status === 'completed', state.status);
  useChatStore.getState().reset(null);
  useChatStore.getState().applyEvent(null, { type: 'assistant.delta', text: 'par' });
  useChatStore.getState().reconcileCompletion(null, state.output ?? '', state.usage);
  const after = useChatStore.getState().feed(null).filter((i) => i.kind === 'assistant');
  ok('reconciled to one bubble, no duplicate', after.length === 1);
  ok('bubble holds the authoritative output', (after[0] as any)?.text === state.output);

  console.log(process.exitCode ? '\nRESULT: FAILURES\n' : '\nRESULT: ALL PASSED\n');
}

main().catch((e) => {
  console.error('\nSMOKE FAILED:', e);
  process.exit(1);
});

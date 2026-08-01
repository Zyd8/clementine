# Architecture: Hermes Mobile Client

A **React Native (Expo)** mobile app that talks to **one Hermes Agent
instance** over its built-in API server. Real-time streaming conversation
with live tool-call progress — terminal output, file edits, web searches,
and agent reasoning rendered as they happen.

**Design principle: single-instance, BYO connection.** The app is a generic
Hermes client, scoped to one instance at a time. The user points it at
*their own* Hermes instance (server URL + API key) — there is no central
server, no central auth, and the app never holds or proxies anyone else's
instance. **Multiple simultaneous instances are explicitly out of scope for
now** (deferred — see "When to add complexity"); within that one instance,
the app *does* support switching between multiple **profiles** (see
Profiles section) — separate accounts/workspaces on the same host.

```
                    ┌──────────────────────────────────────────────┐
                    │            Hermes Mobile (Expo / RN)          │
                    │  Chat UI · Tool-progress feed · Sessions     │
                    │  Connection setup · Profile switcher          │
                    │  Voice mode (ASR/TTS)                        │
                    └───────────────────┬──────────────────────────┘
                                         │
                           HTTPS+SSE, Bearer key (or profile-scoped token)
                                         │
                                ┌────────▼─────────┐
                                │ Hermes instance   │
                                │ (own VPS/laptop)  │
                                │ API server        │
                                │ ── Profile A ──   │
                                │ ── Profile B ──   │
                                └───────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Mobile** | Chat UI, streaming display, tool-call feed, session list, connection setup, profile switcher |
| **API Server (the one instance)** | Agent turn orchestration, tool execution, session persistence, SSE events, profile isolation |
| **Hermes Agent (the one instance)** | Reasoning, tool calls, memory, skills, cron, delegation — per profile |

---

## Reference deployment (dev) — LOCAL Hermes, never the VPS

**Rule (hard): the app connects to a local Hermes instance running on the
dev laptop — NOT to the VPS Hermes (zyd-vps).** The VPS instance is
production infrastructure for this user's other services; wiring the app to
it means every app-driven run shares that instance's API key, sessions,
memory, and terminal access. A bug in the app, a bad test run, or an
accidental prompt would act on the VPS agent as if it were the user —
breaking the very setup that hosts the portfolio, cron jobs, and the other
automations. So the VPS's `CLEMENTINE_API_KEY` is never given to the app, and
the VPS API server stays unreachable from the app's perspective.

Instead, Clementine is pointed at a **local Hermes on the laptop**
(100.106.162.39, clezentine):

- Same Hermes install method as the VPS (`curl -fsSL
  https://hermes-agent.nousresearch.com/install.sh | bash`), same
  `~/.hermes/.env` layout, independent of the VPS copy.
- Its API server is enabled with its own generated key:
  ```
  CLEMENTINE_API_ENABLED=true
  CLEMENTINE_API_KEY=<openssl rand -hex 32>
  ```
- Laptop API server binds `127.0.0.1:8642`; the phone reaches it over LAN
  or Tailscale (see Networking & environment).
- If the laptop instance breaks during app development, it's disposable —
  nothing else depends on it. That's the whole point: the blast radius of
  an experimental client is the laptop agent, not the VPS.

Anything that would point the app at the VPS (its `.env` key, its Tailscale
IP on port 8642, a Caddy route to it) is out of scope for this project.

---

## Engineering principles (non-negotiable)

Three rules govern every decision in this codebase. If a choice violates one,
the choice is wrong.

### 1. KISS — Keep It Simple, Stupid

- The simplest thing that works ships first. No speculative abstractions, no
  "we might need this later" layers, no over-engineered state management.
- One way to do each thing. If two code paths do the same job, delete one.
- Default to boring, well-trodden solutions (fetch, zustand, flat files) over
  clever ones. Novelty only where it buys the user something real.
- When a feature could be done two ways and one is simpler — do that one, and
  say so in the PR. Complexity is a debt that accrues interest; never take it
  on without a concrete, current need.
- Guardrail: if a new abstraction doesn't remove code from the codebase within
  a week of landing, it gets removed.

### 2. TDD — test-driven development

Red → green → refactor. Test the *behavior*, not the implementation.

- **Write the failing test first** for every feature, bug fix, and edge case.
  No test = the work isn't done.
- Unit tests cover the pure logic: SSE parser, sentence buffer, connection
  validation, event normalization, interrupt semantics.
- Hooks and components get behavioral tests (React Testing Library) with fake
  streams — never hit the real network in tests.
- The API layer is tested against mocked fetch/SSE contracts that mirror the
  documented API server shape (the doc's endpoint table is the source of
  truth).
- One e2e smoke test (Maestro) proves the real loop works against a live
  Hermes — run locally before release, not in CI.
- **Coverage floor: 80% on `src/`.** CI fails below it.

### 3. Very modular

- **One concern per module.** A file does one thing and exposes one small
  surface. If a file's purpose needs an "and" to describe, split it.
- **Strict dependency direction:** `app/` → `hooks/` → `stores/` + `api/` →
  `types/`. UI never imports `api/` directly; stores never import components;
  `types/` imports nothing.
- **Provider implementations are swappable modules.** ASR, TTS, SSE, and the
  API client are each behind a small interface (see Voice Profile and the
  `makeClient` factory). Adding a provider = adding a module, not editing the
  pipeline.
- **No god files.** The SSE parser, the chat store, and the connection setup
  each get their own module from day one — refactoring them later is how
  modular code dies.
- **Feature isolation:** connection, profiles, voice, and chat are separate
  store slices with separate test files. One feature's change never breaks
  another's tests.

---

## Repository layout

```
hermes-mobile/
├── app/                        # Expo Router file-based routes
│   ├── (auth)/
│   │   ├── setup.tsx           # Connect: server URL + API key (also used to reconfigure)
│   │   └── voice-profile.tsx   # Voice profile: ASR/TTS providers + keys
│   ├── (tabs)/
│   │   ├── index.tsx           # Chat screen (main)
│   │   ├── sessions.tsx        # Session list / resume (current profile)
│   │   └── tools.tsx           # Toolset/skill discovery view
│   ├── chat/[sessionId].tsx    # Per-session chat
│   ├── _layout.tsx
│   └── +not-found.tsx
├── src/
│   ├── api/                    # HTTP + SSE layer (single client factory)
│   │   ├── client.ts           # makeClient(baseUrl, credential): fetch wrapper + auth + errors
│   │   ├── sse.ts              # SSE stream parser (fetch + ReadableStream)
│   │   ├── runs.ts             # Runs API: create, events, stop, approval
│   │   ├── sessions.ts         # Sessions API: list, create, fork, messages
│   │   ├── jobs.ts             # Jobs API: list, create, pause, run
│   │   └── profiles.ts         # Profiles API: list, exchange for scoped credential
│   ├── voice/                  # Voice pipeline (device-local, BYO keys)
│   │   ├── asr.ts              # Speech-to-text providers (whisper.cpp, Groq, Deepgram, OpenAI)
│   │   ├── tts.ts              # Text-to-speech providers (Edge free, ElevenLabs, OpenAI, MiniMax)
│   │   ├── sentenceBuffer.ts   # Chunk agent text at sentence boundaries for TTS
│   │   └── interrupt.ts        # Stop TTS + cancel run semantics
│   ├── components/
│   │   ├── ui/                 # Primitives (Bubble, Input, Button, MicButton)
│   │   └── features/           # ToolCallCard, RunProgress, SessionRow, VoiceWaveform, ProfilePicker
│   ├── hooks/
│   │   ├── useChat.ts          # Turn lifecycle: create run → subscribe SSE
│   │   ├── useVoiceChat.ts     # Voice turn: ASR → run → sentence-TTS → interrupt
│   │   ├── useSessions.ts      # Session list + resume
│   │   ├── useCapabilities.ts  # Feature detection via /v1/capabilities
│   │   └── useTheme.ts         # Resolves settings store + system scheme → active Theme
│   ├── stores/
│   │   ├── connection.ts       # The one configured instance (SecureStore-backed): url, key
│   │   ├── voiceProfile.ts     # ASR/TTS provider + key per user (SecureStore-backed)
│   │   ├── chat.ts             # In-flight run state, message queue — keyed by profileId | null
│   │   ├── activeProfile.ts    # Currently selected profile + scoped credential (SecureStore-backed)
│   │   └── settings.ts         # App-level prefs (theme: 'system'|'light'|'dark'), AsyncStorage-backed
│   ├── types/
│   │   ├── api.ts              # Envelope types mirroring API server
│   │   ├── events.ts           # SSE event types (assistant.delta, tool.*)
│   │   ├── connection.ts       # Connection model + validation
│   │   ├── profiles.ts         # Profile model + validation
│   │   └── voice.ts            # ASR/TTS provider config + session types
│   ├── utils/
│   └── constants/
│       └── theme.ts            # Light/dark design tokens: colors, spacing, typography
├── assets/
├── app.json
├── package.json
└── tsconfig.json
```

---

## Backend contract (Hermes API server)

Enable once on the host running Hermes (`~/.hermes/.env`):

```
CLEMENTINE_API_ENABLED=true
CLEMENTINE_API_KEY=<long-random-secret>
# CLEMENTINE_API_CORS_ORIGINS=...   # only for browser clients; native app ignores CORS

# Mirror: the names the Hermes gateway actually reads today.
API_SERVER_ENABLED=true
API_SERVER_KEY=<same value as CLEMENTINE_API_KEY>
```

**Naming note.** `CLEMENTINE_API_KEY` is this project's canonical name and the
one every doc, runbook, and onboarding string uses. Upstream Hermes hardcodes
`API_SERVER_KEY` / `API_SERVER_ENABLED` in its gateway, so a host must set both
with identical values or the API server never starts. The mirror lines go away
once upstream reads the `CLEMENTINE_*` names.

Server listens on `http://127.0.0.1:8642` by default. The mobile app reaches it
over HTTPS via a reverse proxy (Caddy on the VPS) or Tailscale for dev.

### Endpoints used

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/capabilities` | Feature detection (runs, SSE, sessions, approval) |
| `POST` | `/v1/runs` | Start an agent run → `run_id` |
| `GET` | `/v1/runs/{id}` | Poll run state (`started`/`running`/`completed`/`failed`/`cancelled`) |
| `GET` | `/v1/runs/{id}/events` | **SSE stream**: tool progress, token deltas, lifecycle, subagent events |
| `POST` | `/v1/runs/{id}/stop` | Interrupt a running turn |
| `POST` | `/v1/runs/{id}/approval` | Resolve a pending approval prompt |
| `GET` | `/api/sessions` | List sessions (`limit`, `offset`) |
| `POST` | `/api/sessions` | Create empty session |
| `GET` | `/api/sessions/{id}/messages` | Message history |
| `POST` | `/api/sessions/{id}/fork` | Branch a session (lineage, `/branch` semantics) |
| `POST` | `/api/sessions/{id}/chat` | One synchronous agent turn |
| `POST` | `/api/sessions/{id}/chat/stream` | **SSE wrapper over one turn**: `assistant.delta`, `tool.started`, `tool.completed`, `run.completed` |
| `GET` | `/api/jobs` | List scheduled jobs |
| `POST` | `/api/jobs` | Create job (cron prompt, schedule) |
| `GET` | `/v1/skills`, `/v1/toolsets` | Enumerate agent capabilities |
| `GET` | `/v1/profiles` | **New, not yet built on the Hermes host** — list independent profiles on this instance (id, name) |
| `POST` | `/v1/profiles/{id}/token` | **New, not yet built** — exchange for that profile's scoped credential (see Profiles section) |

Auth: `Authorization: Bearer $CLEMENTINE_API_KEY` on every request, except once a
profile-scoped credential has been issued (see Profiles section below), which
replaces it for that profile's subsequent requests.

`/v1/capabilities` needs a `profiles: boolean` flag added so the client can
tell whether a given instance supports profiles at all before calling
`/v1/profiles` — older/unpatched Hermes hosts won't have this endpoint.

---

## Real-time streaming (the core)

Two paths, both SSE:

**Path A — Runs API (recommended for the main chat).** Long-form, detachable,
reconnect-safe. Client:

```
1. POST /v1/runs          { input, session_id? }        → { run_id }
2. GET  /v1/runs/{id}/events   (SSE, EventSource-style)
3. render events as they arrive:
   - assistant.delta     → token-by-token text
   - tool.started        → "running terminal: pip install …"
   - tool.completed      → result summary
   - subagent.start/complete → delegation telemetry
   - run.completed       → final output + usage
4. optionally poll GET /v1/runs/{id} after reconnect to reconcile state
```

**Path B — Session chat/stream (simpler, one-turn).**
`POST /api/sessions/{id}/chat/stream` — server drives the whole turn, emits the
four event types, done. Good for quick follow-ups; no run_id bookkeeping.

### Event shape (normalized client-side)

```ts
type StreamEvent =
  | { type: 'assistant.delta'; text: string }
  | { type: 'tool.started';    tool: string; args: string }
  | { type: 'tool.completed';  tool: string; ok: boolean; summary?: string }
  | { type: 'subagent.start';  child_session_id: string }
  | { type: 'subagent.complete'; status: string; duration_ms: number }
  | { type: 'run.completed';   output: string; usage?: TokenUsage };
```

Tool-call events render as collapsible cards in the feed — the app becomes an
agent observability view, not just a chat bubble list.

---

## Mobile architecture

### Principles

1. **SSE is the source of truth for in-flight turns.** Optimistic UI only for the
   user's own message; everything from the agent comes from the stream.
2. **Thin components, typed API layer.** Screens render state; `src/api/*` owns
   HTTP/SSE; `src/types/events.ts` is the contract between them.
3. **Reconnect-safe runs.** If the phone drops the stream, poll
   `GET /v1/runs/{id}` and re-attach to `/events` — never lose the turn.
4. **One connection at a time.** The app targets exactly one Hermes instance
   `(baseUrl, apiKey)`, configured once. Multiple simultaneous instances are
   out of scope for now (see "When to add complexity" if that changes).
5. **Credentials live only on-device.** The connection's API key lives in
   SecureStore. Never in AsyncStorage, never in the bundle, never uploaded
   anywhere.
6. **Profiles are isolated units within the one connection.** The instance
   can host N independent profiles (own sessions, skills, memory,
   credentials) — see Profiles section. Everything in this doc that's
   scoped per-session or per-usage is keyed by `profileId | null` (the
   `null` case covers instances without profiles, or before Phase 3 lands).

### Data flow

```
App launches → reads the stored connection (or sends user to setup if none)
  → GET /v1/capabilities → profiles: true?
    → yes: GET /v1/profiles → show picker, populated live from THIS
            connection's current state — never cached across app sessions
      → user picks profile → POST /v1/profiles/{id}/token → profile credential
    → no: skip picker, use the connection's apiKey directly (backward compatible)
  → taps send
    → makeClient(connection.url, activeCredential)
      → useChat.createRun(sessionId, input)
        → POST /v1/runs   (Authorization: Bearer <activeCredential>)
        → subscribe GET /v1/runs/{id}/events (SSE)
          → normalize events → store (zustand, keyed by profileId | null)
            → ChatScreen renders bubbles + ToolCallCards
              → run.completed → persist session, stop stream, allow next message
```

### Recommended packages

| Package | Purpose |
|---------|---------|
| `expo` + `expo-router` | App shell and routing |
| `react-native-sse` (or fetch-stream polyfill) | Server-Sent Events client |
| `@tanstack/react-query` | Server state: session lists, job lists, polling |
| `zustand` | Connection, active profile, in-flight run state |
| `expo-secure-store` | The connection's API key + server URL, plus the active profile credential |
| `react-hook-form` + `zod` | Connection setup form + runtime validation of event payloads |
| `expo-notifications` | Optional: local notification when a long run completes in background |
| `expo-av` (or `expo-audio`) | Mic capture + audio playback for voice mode |
| `whisper.cpp` RN binding (or WASM) | On-device free ASR (whisper.cpp) |

### Folder rules

| Directory | Contains | Avoid |
|-----------|----------|-------|
| `app/` | Route files only — thin wrappers | Business logic |
| `src/components/ui/` | Bubbles, inputs, cards | Network calls |
| `src/components/features/` | ToolCallCard, RunProgressBar | Direct fetch in JSX |
| `src/hooks/` | `useChat`, `useSessions` — glue | JSX |
| `src/api/` | HTTP/SSE functions, no React | UI imports |
| `src/types/` | API + event types | Runtime logic |

---

## Networking & environment

| Environment | API base URL | Notes |
|-------------|--------------|-------|
| Dev (USB/emulator) | `http://10.0.2.2:8642` (Android emu) or LAN IP | API server on dev laptop (the local Hermes) |
| Dev (physical phone, LAN) | `http://<laptop-ip>:8642` | Same Wi-Fi, laptop = 100.106.162.39 |
| Dev (phone → laptop, Tailscale) | `http://100.106.162.39:8642` | Tailscale on the phone, laptop Hermes |
| Production (public, future) | `https://api.zyldjan.com` | Caddy reverse proxy + TLS — only ever fronts a dedicated instance, never zyd-vps's agent |

**CORS note:** native mobile HTTP is not subject to browser CORS — no
`CLEMENTINE_API_CORS_ORIGINS` needed for the app itself.

**Auth note:** the API server is bearer-auth only, single key. Anyone with the
key has agent access (terminal!) — keep the key out of the repo, out of the
bundle; enter it at setup, store in SecureStore. If the VPS instance is
publicly reachable, put it behind Caddy with TLS and consider an IP allowlist.

---

## Observability & cost visibility

Two things a remote, BYO-instance app cannot get for free: knowing what a
run costs before you fire it, and knowing why something broke on a device you
can't SSH into. Both are core-loop concerns, not polish — build them in at
scaffold time, not after screens exist.

### Cost / usage visibility

- `run.completed` and `run.failed` events already carry `usage?: TokenUsage`
  (see Event shape above) — persist it instead of discarding it.
- **Per-profile running total**: `stores/usage.ts` accumulates token usage
  (and cost, if the instance reports pricing) keyed by `profileId | null` —
  see the re-keying note in the Profiles section — surfaced as a badge in
  the chat header and a breakdown in the connection settings screen (broken
  out per profile, once the instance has more than one).
- **Budget guard**: an optional soft limit, set in the connection's
  settings. Crossing it surfaces a non-blocking warning before the next run
  starts ("this profile has used ~140K tokens today") — it never blocks
  silently, since the app has no authority to cap what the *server* actually
  does.
- Read-only reporting of numbers the server already emits — no new backend
  contract required.

### Crash / error telemetry

- Add Sentry (`@sentry/react-native`) at scaffold time — retrofitting after
  screens and error boundaries exist means re-touching every one of them.
- **Redact secrets before they leave the device.** `apiKey` and `baseUrl`
  values must never reach breadcrumbs or error context — add a `beforeSend`
  scrub filter as part of initial setup, not a follow-up ticket.
- Capture: unhandled JS exceptions, SSE stream errors (tagged by reason: auth,
  network, parse), and voice pipeline provider failures (ASR/TTS 4xx/5xx) —
  exactly the failures a remote, single-shared-key deployment otherwise makes
  invisible.
- No session content (chat text, tool output) goes to telemetry — metadata
  and error shape only.

---

## Accessibility

Streaming, live-updating content (token deltas, tool-call cards flipping
between started/completed) is the hard case for screen readers — silence here
isn't neutral, it makes the app unusable for a whole class of users.

- **Chat bubbles**: mark in-flight assistant messages with
  `accessibilityLiveRegion="polite"` so VoiceOver/TalkBack announce new text
  without interrupting the user — but throttle announcements to sentence
  boundaries (reuse `sentenceBuffer` from the voice pipeline), not every
  token delta, or it becomes unusable noise.
- **ToolCallCard**: expose state changes (`started` → `completed`) via
  `accessibilityLabel`, not color/icon alone — a screen reader user needs to
  hear "terminal: pip install — completed" not just see a checkmark flip.
- **MicButton**: explicit `accessibilityState={{ selected: isRecording }}`
  and a label that changes with state ("Start recording" / "Stop recording").
- Add an `axe`/`accessibility-info` lint pass to the component test layer
  (React Native Testing Library) alongside the existing behavioral tests —
  this belongs in the Testing strategy table below, not bolted on later.

---

## Theming — light & dark mode

System-driven by default, manual override available. No external theming
library — plain design tokens + a hook, consistent with the KISS principle.

- **`src/constants/theme.ts`**: two plain objects, `lightTheme` and
  `darkTheme` — colors, spacing, typography as flat token maps. No
  component ever hardcodes a color; everything reads from these tokens.
- **`src/stores/settings.ts`**: `theme: 'system' | 'light' | 'dark'`,
  persisted via AsyncStorage (not a secret — no SecureStore needed, unlike
  the connection/voice keys).
- **`src/hooks/useTheme.ts`**: the single entry point every themed component
  calls. Resolves `settings.theme` — if `'system'`, falls back to React
  Native's built-in `useColorScheme()`; if `'light'`/`'dark'`, that value
  wins outright. Returns the active `Theme` token object.
- **Live OS switching**: `useColorScheme()` already re-renders on system
  appearance change (e.g. iOS's time-based dark mode) — no extra wiring
  needed beyond consuming the hook.
- **Toggle placement**: a simple light/dark/system control, not a whole new
  screen — surfaced in an existing screen's header (e.g. connection setup)
  rather than standing up a dedicated Settings tab for one control. Add a
  real Settings screen only if a second setting shows up that needs one.
- Built entirely on RN/Expo built-ins (`useColorScheme`, AsyncStorage) — no
  new dependency required.

---

## Error handling

- **Network drop:** SSE auto-reconnect with backoff; on reconnect, poll run
  state and re-attach to events. Never duplicate the user's message.
- **Auth failure (401):** surface "re-enter API key" — keep session list intact.
- **Run failure:** render `run.failed` as an error bubble with the run_id;
  offer retry (same input) or fork.
- **Approval pending:** `run.pending_approval` event → show approve/deny card
  → `POST /v1/runs/{id}/approval`.

---

## Testing strategy (TDD-first)

Tests are written **before** the code they verify — see Engineering
principles §2. The pyramid below is the shape of the suite; the rule is that
every change lands with its test first.

| Layer | Tool | Focus | Written when |
|-------|------|-------|--------------|
| Pure logic | Jest | SSE parser, sentenceBuffer, connection validation, event normalization, interrupt semantics | First — pure functions, no mocks |
| API layer | Jest + mocked fetch/SSE | `makeClient` payloads, auth header, error mapping (mirror the endpoint table above) | Before wiring the UI |
| Hooks | Jest + Testing Library | `useChat`, `useVoiceChat` lifecycles with fake streams | Before the screens |
| Stores | Jest | connection/voiceProfile/chat/activeProfile state transitions | Before the screens |
| Components | React Native Testing Library | Bubble render, ToolCallCard states, MicButton interactions | Alongside the component |
| Accessibility | RNTL + `accessibility-info` assertions | Live-region announcements, ToolCallCard/MicButton labels and state (see Accessibility section) | Alongside the component |
| Theming | Jest | `useTheme` resolution: system light, system dark, each manual override | Before components consume it |
| E2E (one smoke) | Maestro | Send → stream → render against a live Hermes | Before release, locally |

**Coverage floor: 80% on `src/`** — CI fails below it. Tests never hit the
real network; every external call is a contract-mocked fake. The single
exception is the local Maestro smoke test.

---

## CI pipeline (outline)

```yaml
# On every PR:
# - eslint
# - tsc --noEmit
# - jest --coverage (fail under 80% on src/)
# On main:
# - EAS build (Android preview/staging)
# - optional: EAS submit to Play Store (internal track)
```

CI enforces the TDD floor mechanically: no PR merges with coverage below the
threshold, and the suite runs green on every commit. The Maestro smoke test
stays local (needs a live Hermes), never in CI.

---

## Connection setup (single instance)

The app is useless until a user points it at their one Hermes instance.
Setup is the first screen and the backbone of the whole design — there is
**no list to manage**, just one configured connection at a time.

**Connection model (stored in SecureStore):**

```ts
type Connection = {
  name?: string;           // optional user label: "my VPS"
  baseUrl: string;         // https://api.zyldjan.com or tailscale IP
  apiKey: string;          // that instance's CLEMENTINE_API_KEY
  connectedAt: number;
  lastUsedAt?: number;
};
```

No `id` field — there's only ever one, so nothing needs to key off it.
(If multi-instance support returns later, this is the type that gains an
`id` again — see "When to add complexity".)

**Connecting** — the one flow every user does once (or again, if
reconfiguring):

1. First launch with no stored connection → setup screen shown automatically
2. Enters server URL and API key (from their Hermes host's `.env`), optional
   label
3. App validates with `GET /v1/capabilities` (or `/health`) using those
   credentials — wrong key/URL fails fast with a clear error
4. On success: save to SecureStore, open chat

**Onboarding hand-holding (make this dead simple):**

```
You:    "How do I get my key?"
App:    Show: on your Hermes machine, run:
        grep CLEMENTINE_API_KEY ~/.hermes/.env
        (and: hermes gateway setup → API server → on)
        Then paste URL + key here.
```

**Reconfiguring** — replacing the connection with a different instance
entirely (not the same as switching profiles, which stays *within* one
instance — see Profiles section). This is the heavy action: confirm before
proceeding, since it wipes the current connection's local session state.

**Disconnecting** — clearing the stored connection wipes the API key from
SecureStore and all local session/profile state. The remote instance is
untouched (the app never modifies the machine it talks to — only itself).

---

## Profiles (accounts within the one instance)

**The single configured Hermes instance can host multiple independent
profiles** — separate config, sessions, skills, memory, and credentials, all
under one install. Think of them as accounts/workspace partitions on that
one host. This is layered on top of the connection above, not a replacement
for it: the connection is "which host" (now always exactly one), `Profile`
is "which account on that host."

**This requires new backend contract that doesn't exist yet** (`GET
/v1/profiles`, `POST /v1/profiles/{id}/token` — see Backend contract table).
Treat this section as a spec to build against once that lands on the Hermes
host side, not something the client can ship standalone.

### Profile model

```ts
type Profile = {
  id: string;          // reported by the instance, not a local uuid
  name: string;         // display name, from the instance
  description?: string;
};
```

Profiles are **not** stored the way the connection is — the list is always
fetched live from the instance (`GET /v1/profiles`), never cached across app
sessions, since it reflects that host's current state, not something the
phone owns. Only the **active** profile selection persists locally:

```ts
// stores/activeProfile.ts — a single active-profile record, not a map
type ActiveProfile = {
  profileId: string;
  credential: string;   // profile-scoped token from /v1/profiles/{id}/token
  selectedAt: number;
};
```

Stored in SecureStore — same trust tier as the connection's own API key,
since a profile credential is itself agent access. No per-connection keying
needed now that there's only one connection.

### Dynamic population — the actual ask

The profile list is fetched **fresh, at the moment the connection is made
(or the app reopens)** — never pre-fetched, never shown from a stale cache:

1. App connects (fresh setup, or reopening with a stored connection).
2. App checks `/v1/capabilities` — `profiles: true`?
   - **No** (older/unpatched host, or a host with no profiles feature at
     all): skip straight to chat using the connection's `apiKey`, exactly
     like today. Zero behavior change for single-profile instances.
   - **Yes**: call `GET /v1/profiles` right then — the list shown is
     whatever that host currently reports.
3. User picks a profile → `POST /v1/profiles/{id}/token` → store the
   returned credential in `activeProfile` → open chat.
4. If the instance only reports one profile, still show it (don't silently
   auto-select) — the user should always know which account they're in,
   since sessions/memory differ per profile.

### Re-keying existing stores

Everything that was previously keyed by an endpoint id in earlier drafts of
this doc — `stores/chat.ts`, `stores/usage.ts` (Observability & cost
visibility), session lists (Sessions phase) — is keyed by `profileId | null`
now that there's only one connection. `null` covers instances without
profiles, or before Phase 3 lands, so the same store shape covers both cases
without a separate code path.

### Switching profiles vs. reconfiguring the connection

Reconfiguring the connection (pointing at a *different* host entirely) is
the heavy action — see "Reconfiguring" in Connection setup, it's basically
redoing setup and wipes local state. Switching profiles *within* the current
connection should feel lighter — same host, same connection health, just a
different account — but still fully isolated: no session, memory, or
usage-total bleed between profiles on the same instance. Surface a profile
switcher in the chat header so switching doesn't require leaving the chat
screen.

### Open questions to resolve against the real backend contract once built

- Does `/v1/profiles` require the connection's own `apiKey` to call (a
  "gateway key" that only lists profiles), or is listing profiles itself
  gated per-profile somehow? Assumed: connection key lists, profile token
  gates everything else — confirm against the actual implementation.
- Token lifetime/refresh for the profile-scoped credential — does it expire?
  If so, `api/client.ts` needs a refresh-on-401 path that re-runs step 3
  above rather than surfacing "re-enter API key" (which would be wrong here
  — the connection's key may still be fine, only the profile token expired).

---

## Voice mode (the differentiator)

Real-time spoken conversation with the connected Hermes instance. The agent
"thinks" with its own model; the phone owns the speech pipeline with the
user's own keys.

**The core split:**

```
  Listen  → ASR/transcriber   → USER's key (on-device)
  Think   → Hermes agent      → the instance's own model (no key needed —
                                the instance already has one; the app never
                                calls an LLM directly, that would bypass tools)
  Speak   → TTS               → USER's key (on-device)
```

The phone runs the voice pipeline; the Hermes instance only does agent
reasoning + tools. Keys live on the user's device — consistent with the
single-instance, BYO-connection model. Voice works against whichever
instance is currently configured, with nothing installed on the host beyond
the API server itself.

### Providers (free-first, BYO upgrade)

| Stage | Free default (no key) | BYO upgrade |
|-------|----------------------|-------------|
| ASR | On-device whisper.cpp (private, offline-capable) | Groq Whisper / Deepgram streaming / OpenAI Whisper |
| TTS | Edge TTS (Microsoft, no key) | ElevenLabs / OpenAI / MiniMax |

First-run experience = working voice in 30 seconds, zero keys. Power users
drop in their own providers via the Voice Profile screen.

### Turn flow (half-duplex v1)

```
User holds mic button
  → audio streams to ASR provider (their key)
    → live transcript appears as they speak
  → transcript → POST /v1/runs on the configured connection
    → SSE events stream back (tool calls visible in the feed!)
      → agent text accumulates → sentenceBuffer cuts at sentence boundaries
        → each sentence → TTS provider (their key)
          → audio plays; next sentence synthesizes while current plays
  → tap = interrupt: stop TTS playback + POST /v1/runs/{id}/stop
```

### Why sentence-chunked TTS

Don't wait for the whole reply (feels dead) and don't synthesize
half-sentences (sounds chopped). Buffer agent tokens, cut at `.` `!` `?`
newline, synthesize ahead of playback. That pipeline is what produces the
~1-2s first-audio feel.

### Tool feed stays visible during voice

The voice turn uses the same Runs API + SSE as text chat, so users SEE the
agent working (terminal, files, web) while hearing the reply. No other
voice-agent client does this — it's the app's differentiator and directly
showcases Hermes's agentic core.

### Voice Profile (separate from the Hermes connection)

Voice keys are the USER's; the connection (and its profiles) are the
AGENT's. Two stores:

```ts
type VoiceProfile = {
  asr: { provider: 'whisper_cpp' | 'groq' | 'deepgram' | 'openai'; apiKey?: string };
  tts: { provider: 'edge' | 'elevenlabs' | 'openai' | 'minimax'; apiKey?: string; voiceId?: string };
  interruptBehavior: 'stop_speech_only' | 'stop_speech_and_run';
};
```

Stored in SecureStore, edited in the Voice Profile screen. Switching ASR/TTS
providers never touches the connection, agent profiles, or sessions.

### v2 (post-core)

- **Full-duplex**: on-device VAD, barge-in, hands-free continuous conversation
- **Voice cloning** via BYO ElevenLabs
- **Voice-notes-as-messages**: recorded audio turns stored alongside transcripts
- **Background voice session**: app in background, speak, get spoken replies

---

## When to add complexity

| Need | Add |
|------|-----|
| Run completes while app closed | `expo-notifications` + jobs/webhook, or poll `GET /v1/runs/{id}` on foreground |
| QR-code connect (scan to connect) | **Blocked on a cross-repo dependency**: needs a `hermes-mobile connect` CLI command on the Hermes host repo that does not exist yet. Do not schedule this until that command is tracked/built upstream — generate the payload there (`url\|key`), camera scan fills the setup form on this side only. |
| Real push for long jobs | Hermes webhook → FCM relay (small server), not polling |
| iPad / tablet layout | Responsive panes: session list left, chat center, run feed right |
| Sharing your connection between your devices | Encrypted export/import (QR or file) of the connection blob — still on-device, no server |
| **Multiple simultaneous Hermes instances again** | Deliberately removed for now (see design principle at the top) to keep the setup/UX simple. Re-adding it means: bring back an `Endpoint` list model (`id`, `name`, `baseUrl`, `apiKey`) and its own manager screen (list/add/switch/remove), and re-key every store currently keyed by `profileId \| null` (chat, usage, sessions, activeProfile) to the composite `(endpointId, profileId \| null)` — this is the same shape the doc had before this simplification, so it's a known, bounded change if the need comes back. |

**Start simple:** Runs API + SSE + session list + SecureStore. Everything else
ships when the core loop — send, stream, render, resume — is rock solid.

---

## Quick start checklist

TDD-first from commit one: each item lands with its test written before the
implementation (Engineering principles §2).

- [ ] Enable API server on the **local laptop Hermes** (`.env` + gateway restart), verify with `curl /v1/capabilities` — never the VPS instance (see Reference deployment)
- [ ] Scaffold Expo app (`npx create-expo-app hermes-mobile`) + jest/ts/eslint config
- [ ] Wire up Sentry (`@sentry/react-native`) with a `beforeSend` redaction filter for `apiKey`/`baseUrl` — before any other screen lands
- [ ] Test `sse.ts` parser first (framing, partial chunks) → then implement
- [ ] Test `makeClient(baseUrl, key)` contract (auth header, errors) → then implement
- [ ] Connection store + setup screen: URL + API key → validate via `/v1/capabilities` → SecureStore
- [ ] Test `useChat` lifecycle with fake streams → then Chat screen: send → `POST /v1/runs` → stream → render
- [ ] ToolCallCard components for `tool.started` / `tool.completed` — with accessibility labels for state changes from day one, not retrofitted
- [ ] `stores/usage.ts`: persist `run.completed`/`run.failed` token usage per profile, surface as a chat-header badge
- [ ] Session list screen (`GET /api/sessions`) + resume via `chat/stream`
- [ ] Voice Profile screen: ASR/TTS provider + keys → SecureStore
- [ ] Voice v1 (test sentenceBuffer + interrupt first): mic → on-device whisper ASR → run → sentence-TTS (Edge) → play → interrupt
- [ ] First real commit — suite green, coverage ≥ 80%

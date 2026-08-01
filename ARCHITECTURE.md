# Architecture: Hermes Mobile Client

A **React Native (Expo)** mobile app that talks to a running **Hermes Agent** instance over its built-in API server. Real-time streaming conversation with live tool-call progress — terminal output, file edits, web searches, and agent reasoning rendered as they happen.

```
┌──────────────────────────────────────────────────────────────┐
│                  Hermes Mobile (Expo / RN)                    │
│  Chat UI · Tool-progress feed · Sessions · Settings          │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS (JSON + SSE)
                                │ Bearer API_SERVER_KEY
┌───────────────────────────────▼──────────────────────────────┐
│                Hermes Agent — API Server (:8642)              │
│  /v1/chat/completions · /v1/runs · /api/sessions/*           │
└───────────────────────────────┬──────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
           Terminal         Files/Web        Memory/Skills
           (tools)          (tools)          (agent state)
```

| Layer | Responsibility |
|-------|----------------|
| **Mobile** | Chat UI, streaming display, tool-call feed, session list, push-ready state |
| **API Server** | Agent turn orchestration, tool execution, session persistence, SSE events |
| **Hermes Agent** | Reasoning, tool calls, memory, skills, cron, delegation |

---

## Repository layout

```
hermes-mobile/
├── app/                        # Expo Router file-based routes
│   ├── (auth)/
│   │   └── setup.tsx           # Server URL + API key entry
│   ├── (tabs)/
│   │   ├── index.tsx           # Chat screen (main)
│   │   ├── sessions.tsx        # Session list / resume
│   │   └── tools.tsx           # Toolset/skill discovery view
│   ├── chat/[sessionId].tsx    # Per-session chat (deep-linkable)
│   ├── _layout.tsx
│   └── +not-found.tsx
├── src/
│   ├── api/                    # HTTP + SSE layer
│   │   ├── client.ts           # fetch wrapper: base URL, bearer auth, errors
│   │   ├── sse.ts              # SSE stream parser (fetch + ReadableStream)
│   │   ├── runs.ts             # Runs API: create, events, stop, approval
│   │   ├── sessions.ts         # Sessions API: list, create, fork, messages
│   │   └── jobs.ts             # Jobs API: list, create, pause, run
│   ├── components/
│   │   ├── ui/                 # Primitives (Bubble, Input, Button)
│   │   └── features/           # ToolCallCard, RunProgress, SessionRow
│   ├── hooks/
│   │   ├── useChat.ts          # Turn lifecycle: create run → subscribe SSE
│   │   ├── useSessions.ts      # Session list + resume
│   │   └── useCapabilities.ts  # Feature detection via /v1/capabilities
│   ├── stores/
│   │   ├── auth.ts             # Server URL + API key (SecureStore)
│   │   └── chat.ts             # In-flight run state, message queue
│   ├── types/
│   │   ├── api.ts              # Envelope types mirroring API server
│   │   └── events.ts           # SSE event types (assistant.delta, tool.*)
│   ├── utils/
│   └── constants/
├── assets/
├── app.json
├── package.json
└── tsconfig.json
```

---

## Backend contract (Hermes API server)

Enable once on the host running Hermes (`~/.hermes/.env`):

```
API_SERVER_ENABLED=true
API_SERVER_KEY=<long-random-secret>
# API_SERVER_CORS_ORIGINS=...   # only for browser clients; native app ignores CORS
```

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

Auth: `Authorization: Bearer $API_SERVER_KEY` on every request.

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
4. **SecureStore for credentials.** Server URL + API key never touch AsyncStorage.

### Data flow

```
User taps send
  → useChat.createRun(sessionId, input)
    → POST /v1/runs
    → subscribe GET /v1/runs/{id}/events (SSE)
      → normalize events → store (zustand)
        → ChatScreen renders bubbles + ToolCallCards
        → run.completed → persist session, stop stream, allow next message
```

### Recommended packages

| Package | Purpose |
|---------|---------|
| `expo` + `expo-router` | App shell and routing |
| `react-native-sse` (or fetch-stream polyfill) | Server-Sent Events client |
| `@tanstack/react-query` | Server state: session lists, job lists, polling |
| `zustand` | In-flight run state, auth session |
| `expo-secure-store` | API key + server URL storage |
| `react-hook-form` + `zod` | Setup form + runtime validation of event payloads |
| `expo-notifications` | Optional: local notification when a long run completes in background |

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
| Dev (USB/emulator) | `http://10.0.2.2:8642` (Android emu) or LAN IP | API server on dev machine |
| Dev (physical phone, LAN) | `http://<laptop-ip>:8642` | Same Wi-Fi |
| Dev (phone → VPS, Tailscale) | `http://100.117.41.58:8642` | Tailscale on the phone |
| Production (public) | `https://api.zyldjan.com` | Caddy reverse proxy + TLS on VPS |

**CORS note:** native mobile HTTP is not subject to browser CORS — no
`API_SERVER_CORS_ORIGINS` needed for the app itself.

**Auth note:** the API server is bearer-auth only, single key. Anyone with the
key has agent access (terminal!) — keep the key out of the repo, out of the
bundle; enter it at setup, store in SecureStore. If the VPS endpoint is
public, put it behind Caddy with TLS and consider an IP allowlist.

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

## Testing strategy

| Layer | Tool | Focus |
|-------|------|-------|
| API layer | Jest + mocked fetch/SSE | Endpoint payloads, auth header, error mapping |
| SSE parser | Jest | Event framing, partial chunks, reconnect |
| Hooks | Jest + Testing Library | `useChat` lifecycle with fake streams |
| Components | React Native Testing Library | Bubble render, ToolCallCard states |
| E2E (optional) | Maestro | Send → stream → render against a live Hermes |

---

## CI pipeline (outline)

```yaml
# On every PR:
# - eslint, tsc, jest
# On main:
# - EAS build (Android preview/staging)
# - optional: EAS submit to Play Store (internal track)
```

---

## When to add complexity

| Need | Add |
|------|-----|
| Run completes while app closed | `expo-notifications` + jobs/webhook, or poll `GET /v1/runs/{id}` on foreground |
| Multiple Hermes profiles/instances | Settings screen with multiple saved endpoints; pick per session |
| Voice to Hermes | STT (whisper) → send text turn; TTS audio reply from agent |
| Real push for long jobs | Hermes webhook → FCM relay (small server), not polling |
| iPad / tablet layout | Responsive panes: session list left, chat center, run feed right |

**Start simple:** Runs API + SSE + session list + SecureStore. Everything else
ships when the core loop — send, stream, render, resume — is rock solid.

---

## Quick start checklist

- [ ] Enable API server on the Hermes host (`.env` + gateway restart), verify with `curl /v1/capabilities`
- [ ] Scaffold Expo app (`npx create-expo-app hermes-mobile`)
- [ ] `src/api/client.ts` — base URL + bearer auth + typed errors
- [ ] `src/api/sse.ts` — SSE client + event normalizer
- [ ] Setup screen: server URL + API key → SecureStore
- [ ] Chat screen: send → `POST /v1/runs` → stream events → render
- [ ] ToolCallCard components for `tool.started` / `tool.completed`
- [ ] Session list screen (`GET /api/sessions`) + resume via `chat/stream`
- [ ] First real commit

# Architecture: Hermes Mobile Client

A **React Native (Expo)** mobile app that talks to **any number of Hermes Agent instances** over their built-in API servers. Real-time streaming conversation with live tool-call progress — terminal output, file edits, web searches, and agent reasoning rendered as they happen.

**Design principle: decentralized, BYO-endpoint.** The app is a generic Hermes client. Each user points it at *their own* Hermes instance (server URL + API key) — there is no central server, no central auth, and the app never holds or proxies anyone else's instance. It is a remote control for the instances the user chooses to connect.

```
                    ┌──────────────────────────────────────────────┐
                    │            Hermes Mobile (Expo / RN)          │
                    │  Chat UI · Tool-progress feed · Sessions     │
                    │  Endpoint manager · Voice mode (ASR/TTS)     │
                    └───────┬──────────────┬──────────────┬────────┘
                            │              │              │
              HTTPS+SSE     │              │              │     HTTPS+SSE
              Bearer key A  │              │  Bearer key B│     Bearer key C
                    ┌───────▼──────┐ ┌──────▼───────┐ ┌─────▼─────────┐
                    │ Hermes #1    │ │ Hermes #2    │ │ Hermes #3     │
                    │ (own VPS)    │ │ (laptop)     │ │ (friend's box)│
                    │ API server   │ │ API server   │ │ API server    │
                    └──────────────┘ └──────────────┘ └───────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Mobile** | Chat UI, streaming display, tool-call feed, session list, endpoint manager |
| **API Server (per instance)** | Agent turn orchestration, tool execution, session persistence, SSE events |
| **Hermes Agent (per instance)** | Reasoning, tool calls, memory, skills, cron, delegation |

---

## Repository layout

```
hermes-mobile/
├── app/                        # Expo Router file-based routes
│   ├── (auth)/
│   │   ├── setup.tsx           # Add endpoint: server URL + API key
│   │   └── voice-profile.tsx   # Voice profile: ASR/TTS providers + keys
│   ├── (tabs)/
│   │   ├── index.tsx           # Chat screen (main, active endpoint)
│   │   ├── endpoints.tsx       # Endpoint manager — list/add/remove instances
│   │   ├── sessions.tsx        # Session list / resume (per endpoint)
│   │   └── tools.tsx           # Toolset/skill discovery view
│   ├── chat/[endpointId]/[sessionId].tsx  # Per-endpoint, per-session chat
│   ├── _layout.tsx
│   └── +not-found.tsx
├── src/
│   ├── api/                    # HTTP + SSE layer (per-endpoint client factory)
│   │   ├── client.ts           # makeClient(baseUrl, key): fetch wrapper + auth + errors
│   │   ├── sse.ts              # SSE stream parser (fetch + ReadableStream)
│   │   ├── runs.ts             # Runs API: create, events, stop, approval
│   │   ├── sessions.ts         # Sessions API: list, create, fork, messages
│   │   └── jobs.ts             # Jobs API: list, create, pause, run
│   ├── voice/                  # Voice pipeline (device-local, BYO keys)
│   │   ├── asr.ts              # Speech-to-text providers (whisper.cpp, Groq, Deepgram, OpenAI)
│   │   ├── tts.ts              # Text-to-speech providers (Edge free, ElevenLabs, OpenAI, MiniMax)
│   │   ├── sentenceBuffer.ts   # Chunk agent text at sentence boundaries for TTS
│   │   └── interrupt.ts        # Stop TTS + cancel run semantics
│   ├── components/
│   │   ├── ui/                 # Primitives (Bubble, Input, Button, MicButton)
│   │   └── features/           # ToolCallCard, RunProgress, SessionRow, VoiceWaveform
│   ├── hooks/
│   │   ├── useChat.ts          # Turn lifecycle: create run → subscribe SSE
│   │   ├── useVoiceChat.ts     # Voice turn: ASR → run → sentence-TTS → interrupt
│   │   ├── useSessions.ts      # Session list + resume
│   │   └── useCapabilities.ts  # Feature detection via /v1/capabilities
│   ├── stores/
│   │   ├── endpoints.ts        # Saved instances (SecureStore-backed): id, name, url, key
│   │   ├── activeEndpoint.ts   # Currently selected endpoint
│   │   ├── voiceProfile.ts     # ASR/TTS provider + key per user (SecureStore-backed)
│   │   └── chat.ts             # In-flight run state, message queue
│   ├── types/
│   │   ├── api.ts              # Envelope types mirroring API server
│   │   ├── events.ts           # SSE event types (assistant.delta, tool.*)
│   │   ├── endpoints.ts        # Endpoint model + validation
│   │   └── voice.ts            # ASR/TTS provider config + session types
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
4. **Endpoints are isolated units.** Every connection is `(baseUrl, apiKey)`.
   No shared state, no cross-talk, no central sync. One endpoint's failure or
   removal never affects another. The app is a thin shell over N independent
   Hermes instances.
5. **Credentials live only on-device, per endpoint.** API keys in SecureStore,
   scoped to their endpoint id. Never in AsyncStorage, never in the bundle,
   never uploaded anywhere.

### Data flow

```
User picks endpoint (endpoints store) + taps send
  → makeClient(endpoint.url, endpoint.key)
    → useChat.createRun(sessionId, input)
      → POST /v1/runs   (Authorization: Bearer <endpoint.key>)
      → subscribe GET /v1/runs/{id}/events (SSE)
        → normalize events → store (zustand, keyed by endpointId)
          → ChatScreen renders bubbles + ToolCallCards
            → run.completed → persist session, stop stream, allow next message
```

### Recommended packages

| Package | Purpose |
|---------|---------|
| `expo` + `expo-router` | App shell and routing |
| `react-native-sse` (or fetch-stream polyfill) | Server-Sent Events client |
| `@tanstack/react-query` | Server state: session lists, job lists, polling |
| `zustand` | Endpoints, active endpoint, in-flight run state |
| `expo-secure-store` | Per-endpoint API keys + server URLs |
| `react-hook-form` + `zod` | Endpoint form + runtime validation of event payloads |
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

## Endpoint manager (the decentralized core)

The app is useless until a user points it at at least one Hermes instance. The
endpoint manager is the first screen and the backbone of the whole design.

**Endpoint model (stored in SecureStore, keyed by endpointId):**

```ts
type Endpoint = {
  id: string;              // uuid — local, never leaves the device
  name: string;            // user label: "my VPS", "work laptop"
  baseUrl: string;         // https://api.zyldjan.com or tailscale IP
  apiKey: string;          // that instance's API_SERVER_KEY
  createdAt: number;
  lastUsedAt?: number;
};
```

**Adding an endpoint** — the one flow every user does once per instance:

1. User taps "+ Add Hermes"
2. Enters a name, server URL, and API key (from their Hermes host's `.env`)
3. App validates with `GET /v1/capabilities` (or `/health`) using those
   credentials — wrong key/URL fails fast with a clear error
4. On success: save to SecureStore, mark active, open chat

**Onboarding hand-holding (make this dead simple):**

```
You:    "How do I get my key?"
App:    Show: on your Hermes machine, run:
        grep API_SERVER_KEY ~/.hermes/.env
        (and: hermes gateway setup → API server → on)
        Then paste URL + key here.
```

**Switching** — active endpoint is a single zustand field; every API client is
created per-request from the active endpoint's credentials, so switching is
instant and stateless on the app side.

**Removal** — deleting an endpoint wipes its key from SecureStore and its
sessions from local state. The remote instance is untouched (the app never
modifies another machine — it only talks to it).

---

## Voice mode (the differentiator)

Real-time spoken conversation with any connected Hermes instance. The agent
"thinks" with its own model; the phone owns the speech pipeline with the
user's own keys.

**The core split:**

```
  Listen  → ASR/transcriber   → USER's key (on-device)
  Think   → Hermes agent      → the endpoint's own model (no key needed —
                                the instance already has one; the app never
                                calls an LLM directly, that would bypass tools)
  Speak   → TTS               → USER's key (on-device)
```

The phone runs the voice pipeline; the Hermes instance only does agent
reasoning + tools. Keys live on the user's device — consistent with the
decentralized BYO-endpoint model. Voice works against ANY Hermes instance,
including other people's, with nothing installed on their side.

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
  → transcript → POST /v1/runs on the active endpoint
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

### Voice Profile (separate from endpoints)

Voice keys are the USER's; endpoints are the AGENTS'. Two stores:

```ts
type VoiceProfile = {
  asr: { provider: 'whisper_cpp' | 'groq' | 'deepgram' | 'openai'; apiKey?: string };
  tts: { provider: 'edge' | 'elevenlabs' | 'openai' | 'minimax'; apiKey?: string; voiceId?: string };
  interruptBehavior: 'stop_speech_only' | 'stop_speech_and_run';
};
```

Stored in SecureStore, edited in the Voice Profile screen. Switching ASR/TTS
providers never touches endpoints or sessions.

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
| QR-code connect (scan to add endpoint) | Generate a payload on the Hermes host (`hermes-mobile connect`) → encode `url|key` → camera scan fills the form |
| Real push for long jobs | Hermes webhook → FCM relay (small server), not polling |
| iPad / tablet layout | Responsive panes: endpoint list left, chat center, run feed right |
| Sharing endpoints between your devices | Encrypted export/import (QR or file) of the endpoint blob — still on-device, no server |

**Start simple:** Runs API + SSE + session list + SecureStore. Everything else
ships when the core loop — send, stream, render, resume — is rock solid.

---

## Quick start checklist

- [ ] Enable API server on the Hermes host (`.env` + gateway restart), verify with `curl /v1/capabilities`
- [ ] Scaffold Expo app (`npx create-expo-app hermes-mobile`)
- [ ] `src/api/client.ts` — `makeClient(baseUrl, key)` factory: base URL + bearer auth + typed errors
- [ ] `src/api/sse.ts` — SSE client + event normalizer
- [ ] Endpoint store + add-endpoint screen: URL + API key → validate via `/v1/capabilities` → SecureStore
- [ ] Endpoint manager screen: list, switch, remove
- [ ] Chat screen: send → `POST /v1/runs` → stream events → render
- [ ] ToolCallCard components for `tool.started` / `tool.completed`
- [ ] Session list screen (`GET /api/sessions`) + resume via `chat/stream`
- [ ] Voice Profile screen: ASR/TTS provider + keys → SecureStore
- [ ] Voice v1: mic → on-device whisper ASR → run → sentence-TTS (Edge) → play → interrupt
- [ ] First real commit

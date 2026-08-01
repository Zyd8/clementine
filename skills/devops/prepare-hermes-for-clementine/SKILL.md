---
name: prepare-hermes-for-clementine
description: "Use when preparing a Hermes host so the Clementine mobile app can connect. Enables the API server, verifies the contract, checks reachability."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [hermes, clementine, mobile, api-server, connection-setup]
    related_skills: [hermes-agent-skill-authoring]
---

# Preparing a Hermes Instance for Clementine

## Overview

Clementine is a mobile client that talks to exactly one Hermes instance over
its built-in API server (HTTPS+SSE, bearer auth). This skill is run **on the
Hermes host itself** — it gets that host into a state where the Clementine
app's setup screen (URL + API key) will succeed on the first try. It does not
touch the phone or the app; it only prepares the server side of the
handshake.

**Scope note:** this skill is for a Hermes instance the user actually wants
Clementine to reach — typically their own laptop/desktop Hermes. If your
CLAUDE.md or project instructions carve out a separate managed host (e.g. a
VPS run by another agent) as off-limits, that carve-out still applies here —
do not run this skill against a host you've been told not to touch, even if
the user's phrasing sounds like it could include it. Ask if unsure which
host they mean.

## When to Use

- User says some version of "get Hermes ready for Clementine" / "let my phone
  connect" / "set up the mobile API server"
- Clementine's setup screen is failing to validate against this host and you
  need to check what's misconfigured
- Onboarding a new Hermes host that will serve as someone's primary mobile
  connection

Don't use for: configuring the Clementine app itself (that's mobile-side,
out of scope for a Hermes host session) or setting up profiles (blocked
upstream — see "Profiles are not built yet" below).

## Steps

1. **Enable the API server.** Edit `~/.hermes/.env` on this host:
   ```
   CLEMENTINE_API_ENABLED=true
   CLEMENTINE_API_KEY=<generate with: openssl rand -hex 32>
   ```
   Never reuse a key from another instance or paste one in from chat history
   — generate fresh, on this host, right now.

2. **Restart the gateway** so the env change takes effect (however this host
   normally restarts its Hermes process — service manager, tmux relaunch,
   etc.).

3. **Verify locally:**
   ```
   curl -H "Authorization: Bearer $CLEMENTINE_API_KEY" http://127.0.0.1:8642/v1/capabilities
   ```
   Completion criterion: a 200 response with a JSON capabilities body. A 401
   means the key isn't loaded (gateway needs a real restart, not a reload); a
   connection refused means `CLEMENTINE_API_ENABLED` didn't take.

4. **Confirm the response shape** the app depends on: `runs`, `sse`,
   `sessions`, `approval` flags present. If a `profiles` flag is present and
   `true`, the host has the newer profiles endpoints; if absent, treat this
   as a pre-profiles host (expected on most installs today — see below).

5. **Establish phone reachability.** Pick exactly one path and confirm it
   works from the phone's network, not just localhost:
   - **Same Wi-Fi (LAN):** find this host's LAN IP, confirm `curl` from
     another device on the same network reaches
     `http://<lan-ip>:8642/v1/capabilities`.
   - **Tailscale:** confirm this host is on the tailnet (`tailscale status`),
     note its tailnet IP, confirm the phone is on the same tailnet.
   - **Public/production:** confirm a reverse proxy (Caddy or similar) fronts
     port 8642 with TLS, and that `CLEMENTINE_API_CORS_ORIGINS` is *not* needed
     (native app traffic isn't subject to browser CORS — don't add it on
     this account).
   Do not expose port 8642 directly to the public internet without TLS in
   front of it — the API key is a single bearer secret with full agent/tool
   access; an intercepted key is equivalent to shell access on this host.

6. **Hand the user exactly two values**, nothing else: the base URL for
   their chosen reachability path, and the API key (`grep CLEMENTINE_API_KEY
   ~/.hermes/.env` if they've lost it — never print it into a shared/logged
   channel, only directly to the user in this session).

## Profiles Are Not Built Yet

Clementine's client checks `capabilities.profiles` and falls back to a
single implicit profile (this host's one `CLEMENTINE_API_KEY`) when the flag is
absent or `false`. If the user asks you to set up "profiles" or multiple
independent identities on one instance, tell them that's a client feature
waiting on host-side endpoints (`GET /v1/profiles`,
`POST /v1/profiles/{id}/token`) that don't exist yet — don't try to
hand-roll them.

## Common Pitfalls

1. **Editing `.env` without restarting the gateway.** The key and enable
   flag are read at process start; a running gateway won't pick up the
   change until restarted.
2. **Reusing a key across hosts.** Each Hermes instance needs its own
   generated `CLEMENTINE_API_KEY` — copying one from another host's `.env`
   couples their security boundaries for no reason.
3. **Testing only `127.0.0.1`.** A working `curl` from the host itself does
   not prove the phone can reach it — always verify from the actual network
   path (LAN IP, Tailscale IP, or public URL) before declaring success.
4. **Adding `CLEMENTINE_API_CORS_ORIGINS` "just in case."** It's for browser
   clients only; the native app ignores CORS entirely. Adding it widens the
   attack surface for no benefit here.
5. **Printing the API key somewhere it can leak** (commit messages, shared
   logs, a ticket). Deliver it directly to the user, once, in-session.
6. **Confusing "prepare Hermes" with "configure the app."** This skill ends
   at handing over `(baseUrl, apiKey)` — entering them into Clementine's
   setup screen is the user's action on the phone, not something to attempt
   from here.

## Verification Checklist

- [ ] `CLEMENTINE_API_ENABLED=true` and a freshly generated `CLEMENTINE_API_KEY` are
      in `~/.hermes/.env`
- [ ] Gateway restarted after the `.env` edit
- [ ] `curl .../v1/capabilities` with the bearer key returns 200 from
      `127.0.0.1`
- [ ] Capabilities response includes `runs`, `sse`, `sessions`, `approval`;
      `profiles` flag noted (present+true, or absent/false)
- [ ] Reachability path chosen (LAN / Tailscale / public+TLS) and verified
      from a device other than the host itself
- [ ] No blanket CORS or public-without-TLS exposure introduced
- [ ] User has the base URL + API key, delivered directly and not logged
      anywhere persistent

---
version: alpha
name: Clementine — Gold Focus
description: Terminal-native agent observability. Deep charcoal canvas, one gold accent that means "the agent is working", muted steel for idle. Monospace-first, flat, translucent — the user's desktop (Qtile, dark+gold) reborn as a mobile agent cockpit.
colors:
  primary: "#f0a030"
  canvas: "#1a1d23"
  canvas-raised: "#23272f"
  gold: "#f0a030"
  gold-dim: "#c8872a"
  steel: "#2c3e50"
  ink: "#e8e6e3"
  ink-muted: "#8a8f98"
  ok: "#6abf69"
  err: "#e06c75"
typography:
  display:
    fontFamily: JetBrainsMono Nerd Font
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading:
    fontFamily: JetBrainsMono Nerd Font
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: JetBrainsMono Nerd Font
    fontSize: 0.95rem
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: JetBrainsMono Nerd Font
    fontSize: 0.85rem
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 4px
  md: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
components:
  focus-border-active:
    borderColor: "{colors.gold}"
    borderWidth: 2
  focus-border-idle:
    borderColor: "{colors.steel}"
    borderWidth: 1
  endpoint-card:
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.steel}"
    rounded: "{rounded.md}"
    padding: 16px
  endpoint-card-active:
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.gold}"
    rounded: "{rounded.md}"
    padding: 16px
  user-bubble:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 12px
  agent-bubble:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.gold}"
    borderWidth: 2
    padding: 12px
  tool-line:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: 8px
  tool-line-ok:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.ok}"
    rounded: "{rounded.sm}"
    padding: 8px
  tool-line-err:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.err}"
    rounded: "{rounded.sm}"
    padding: 8px
  mic-button:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.canvas}"
    rounded: "9999px"
    size: 64px
  mic-button-listening:
    backgroundColor: "{colors.canvas-raised}"
    borderColor: "{colors.gold}"
    borderWidth: 2
    rounded: "9999px"
    size: 64px
  voice-waveform:
    stroke: "{colors.gold}"
    backgroundColor: "transparent"
---

## Overview

Clementine is a mobile client for Hermes Agent. It is not a chat app — it is a
cockpit for watching and driving an autonomous agent. Every visual decision
derives from the user's own desktop: a Qtile X11 setup with a dark charcoal
canvas (#1a1d23), a single gold accent (#f0a030), flat surfaces, and
terminal-native typography. The app should feel like the user's workspace
grew a screen.

The core idea is **gold = focus**. In the user's window manager, the focused
window wears a gold border and every idle window wears muted steel. Clementine
borrows that language wholesale: the active endpoint, the running tool call,
the live voice waveform — the thing the agent is doing RIGHT NOW — gets the
gold border. Everything idle gets steel. The user reads the app's state the
same way they read their desktop.

## Colors

- **canvas (#1a1d23):** the base. The app is a dark room; content is what
  glows in it. Never use pure black — the canvas has warmth.
- **canvas-raised (#23272f):** one step up for cards, bubbles, tool lines.
  Flat, not elevated — no drop shadows, no gradients.
- **gold (#f0a030):** the single accent. Means "the agent is focused here":
  active endpoint border, agent bubble border, tool-in-progress marker,
  mic button, live waveform. Use sparingly — it is a state signal, not a
  decoration.
- **gold-dim (#c8872a):** pressed/loading states of gold elements.
- **steel (#2c3e50):** idle borders, dividers, inactive states. The "nothing
  is happening" color.
- **ink (#e8e6e3):** primary text — warm off-white, never pure white.
- **ink-muted (#8a8f98):** secondary text, timestamps, tool arguments.
- **ok (#6abf69) / err (#e06c75):** reserved strictly for tool outcomes in
  the observability feed. Never used for branding or decoration.

## Typography

JetBrainsMono Nerd Font everywhere. This is a tool for people who live in
terminals; proportional fonts would break the spell. Text is compact,
all-caps labels are allowed for section headers, and no letter-spacing games
on body text. Numeric/token data (run ids, token counts, timings) always
renders in the mono variant.

## Layout

- Flat, single-column flows with generous padding — mobile-first.
- The chat surface is a terminal scrollback: user and agent turns interleave
  with tool lines exactly like a REPL transcript, not like two people texting.
- 90% opacity panels over the canvas (the user's picom setting), but never
  so translucent that text loses readability.
- No gradients, no glassmorphism, no drop shadows, no rounded-corners-everywhere.
  Radius is 4px or 8px. The mic button is the ONLY fully-round element.

## Elevation & Depth

Flat, flat, flat. Depth is communicated by the gold/steel border language and
by canvas-raised surfaces — never by shadows or blur. A raised card is
lighter than the canvas, that's it.

## Shapes

4px radius for tool lines and small chips, 8px for cards and bubbles, full
circle only for the mic button.

## Components

`focus-border-active` and `focus-border-idle` are the semantic skeleton of the
app: a 2px gold border marks the live element (active endpoint, running tool,
listening mic), a 1px steel border marks everything dormant. `endpoint-card`
is the idle instance; `endpoint-card-active` is the selected one. Bubbles:
the user's messages are flat raised panels; the agent's messages are
transparent with a gold left-hand border — the agent "speaks" in the focus
color. `tool-line` renders agent actions as terminal lines in muted ink;
`tool-line-ok` and `tool-line-err` recolor the line by outcome. The mic
button is gold when armed, and when listening it becomes a raised circle
ringed with the gold focus border while the waveform (`voice-waveform`,
gold stroke) renders live amplitude.

## Do's and Don'ts

Do: keep gold rare and meaningful. Do: let the tool feed look like a
terminal — monospace, compact, scannable. Do: use steel for every idle
border so gold always stands out. Do: respect the flat, warm-dark palette
exactly as specified.

Don't: add gradients, shadows, blur, or glass effects. Don't: use gold for
decorative highlights, icons, or branding flourishes — if it's not a state
signal it doesn't get the accent. Don't: introduce proportional fonts or
rounded-corners-everywhere. Don't: invent new colors — any new UI state must
reuse canvas, canvas-raised, gold, steel, ink, ink-muted, ok, or err.

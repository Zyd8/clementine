# Clementine — project instructions

## Read the design record before doing anything

Before answering a question, proposing a change, or writing any code in this
repo, read these in order. Not skimmed, not assumed from a previous session —
they change often and are the source of truth over your own memory:

1. `ARCHITECTURE.md` — the system contract: backend endpoints, streaming
   model, module boundaries, security rules, networking table.
2. `DESIGN.md` — the Clementine "Gold Focus" design system: tokens, colors,
   typography, component styling.
3. `plan/` — every file, in order (`00-overview.md` first; it's the index and
   states the phase order and the definition of done). Phase files carry the
   live checklist state.
4. `design/` — the design bundle: `README.md` (screen-by-screen handoff spec),
   `Hermes Mobile.dc.html` (interactive prototype, **reference only — never
   port its HTML/CSS**), `android-frame.jsx`.

`plan/` and `design/` are gitignored — they are local working documents, not
shipped history. Read them anyway; they hold decisions the committed docs
don't. If something in them deserves to survive as project record, promote it
into `ARCHITECTURE.md` rather than leaving it in `plan/`.

When these sources disagree, `ARCHITECTURE.md` wins; say so rather than
silently picking one.

## Project non-negotiables

Restated from `ARCHITECTURE.md` because they get violated under time pressure:

- **TDD.** Failing test before implementation, every item, every phase.
- **80% coverage floor on `src/`**, enforced in CI from phase 1 — never
  "added later."
- **Strict dependency direction:** `app/` → `hooks/` → `stores/`+`api/` →
  `types/`. No god files.
- **Secrets never leave the device unredacted** — including Sentry
  breadcrumbs, not just the bundle.
- **Finish a phase before starting the next one.** Partial phases are how the
  module boundaries end up broken.

## Naming

The Hermes host env vars for this app are `CLEMENTINE_API_ENABLED`,
`CLEMENTINE_API_KEY`, and `CLEMENTINE_API_CORS_ORIGINS`. The older generic
`API_SERVER_*` names are retired — don't reintroduce them, in docs or code.

## Hosts

Preparing a Hermes host to accept a Clementine connection is covered by
`skills/devops/prepare-hermes-for-clementine/SKILL.md`. Note that the
user-level `CLAUDE.md` marks the zyd-vps Hermes instance as off-limits — that
carve-out applies here too; Clementine's target is the local laptop Hermes
unless the user says otherwise.

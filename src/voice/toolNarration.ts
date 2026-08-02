/**
 * What voice mode says while it's working, instead of dead air.
 *
 * Two gaps used to be pure silence: the round trip from "you stopped
 * talking" to the reply actually starting, and any tool call the agent
 * makes along the way. Both get a spoken line — a filler for the first,
 * a description of what's happening for the second.
 *
 * Two rules keep this from turning into its own kind of annoying:
 *   - The tool name itself is never spoken. A user hears "web_search" or
 *     "read_file" as jargon, not information — it says the wrong thing to
 *     the wrong audience. `describeTool` translates it into what the tool
 *     DOES, in plain language, with a generic fallback for anything it
 *     doesn't recognize.
 *   - Each filler fires at most once per turn (enforced by the caller, not
 *     here) and the wording is picked from a pool rather than fixed, so a
 *     multi-tool reply doesn't say "One moment" three times in a row.
 */

/** Said once, right after the agent starts working, to fill the silence. */
const THINKING_FILLERS = [
  'Hmm, let me think.',
  'Let me see.',
  'Okay, one sec.',
  'Give me a moment.',
  "Let's see here.",
  'Alright, thinking.',
] as const;

/** Said once, the first time (and only the first time) a tool runs. */
const TOOL_FILLER_TEMPLATES = [
  (what: string) => `Hang on, ${what}.`,
  (what: string) => `Just a sec, ${what}.`,
  (what: string) => `Okay, ${what}.`,
  (what: string) => `One moment — ${what}.`,
  (what: string) => `Give me a second, ${what}.`,
] as const;

/** Nothing about the tool's name matched — said without pretending to know more. */
const GENERIC_TOOL_DESCRIPTION = 'working on that';

/**
 * Translate an internal tool name into what it does, in plain language.
 *
 * Tool names are whatever the connected agent happens to call them —
 * unpredictable, sometimes internal-only shorthand. Matched by keyword
 * rather than an exact list, so a name this has never seen before still has
 * a decent chance of landing on something sensible instead of falling
 * straight to the generic line.
 */
export function describeTool(tool: string): string {
  const name = tool.toLowerCase();

  if (/calendar|schedule|event/.test(name)) return 'checking the calendar';
  if (/search|browse|web|fetch/.test(name)) return 'searching for that';
  if (/read|open|load/.test(name)) return 'looking that up';
  if (/write|save|create|edit|update/.test(name)) return 'saving that';
  if (/delete|remove/.test(name)) return 'cleaning that up';
  if (/code|exec|run|script|shell|command/.test(name)) return 'running that';
  if (/calc|math|compute/.test(name)) return 'working that out';
  if (/memory|remember|recall/.test(name)) return 'checking what I remember';
  if (/image|photo|picture|vision/.test(name)) return 'taking a look';
  if (/email|mail|message|send/.test(name)) return 'sending that';

  return GENERIC_TOOL_DESCRIPTION;
}

const pick = <T,>(pool: readonly T[]): T => pool[Math.floor(Math.random() * pool.length)]!;

/** A random "I'm on it" line — never the same wording twice in a row by design. */
export function pickThinkingFiller(): string {
  return pick(THINKING_FILLERS);
}

/** A random line describing what a tool is doing — never the tool's own name. */
export function pickToolFiller(tool: string): string {
  return pick(TOOL_FILLER_TEMPLATES)(describeTool(tool));
}

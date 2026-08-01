/**
 * Secret redaction for anything leaving the device via telemetry.
 *
 * The connection's API key IS agent access — terminal included — so a leaked
 * key in a Sentry breadcrumb is a remote shell handed to whoever reads the
 * dashboard. The base URL is nearly as sensitive: it discloses the address of
 * a bearer-auth-only host.
 *
 * This runs as Sentry's `beforeSend`/`beforeBreadcrumb`. It is deliberately
 * a pure function over a plain object so it can be tested without Sentry.
 */

const REDACTED = '[redacted]';

/** Key names whose *values* are never allowed off-device. */
const SENSITIVE_KEY = /^(api[-_]?key|base[-_]?url|url|authorization|credential|token|secret|password)$/i;

/** `Bearer <token>` appearing inside free text (e.g. an error message). */
const BEARER_IN_TEXT = /\b(bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;

/** Anything that looks like a host address in free text. */
const URL_IN_TEXT = /\b(https?:\/\/)[^\s"']+/gi;

const scrubString = (value: string): string =>
  value.replace(BEARER_IN_TEXT, `$1${REDACTED}`).replace(URL_IN_TEXT, REDACTED);

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;

  // A circular graph must not hang the reporter — drop the back-edge.
  if (seen.has(value as object)) return REDACTED;
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((item) => scrubValue(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubValue(nested, seen);
  }
  return out;
}

/**
 * Returns a redacted copy. Never returns null: dropping the event entirely
 * would trade one leak for total blindness, and the whole point of telemetry
 * here is seeing failures on a device nobody can SSH into.
 */
export function scrubEvent<T>(event: T): T {
  return scrubValue(event, new WeakSet()) as T;
}

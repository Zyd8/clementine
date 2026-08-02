import * as Sentry from '@sentry/react-native';

import { scrubEvent } from './scrubEvent';

/**
 * Crash/error telemetry, wired at scaffold time.
 *
 * Retrofitting this after screens and error boundaries exist means
 * re-touching every one of them — hence day one, before any feature lands.
 * Every event and breadcrumb passes through `scrubEvent` first: no API key,
 * no base URL, and no session content ever leaves the device.
 *
 * Voice pipeline (Phase 7): ASR/TTS provider failures (ElevenLabs, etc.)
 * will be captured via `Sentry.captureException` tagged with
 * `{ tags: { reason: 'voice' } }`. The stub is intentionally empty — there
 * is no voice pipeline to report on yet.
 */
export function initTelemetry({ dsn }: { dsn: string | undefined }): void {
  // No DSN configured (the normal case for local dev) — stay off entirely
  // rather than installing a reporter that quietly drops everything.
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
  });
}

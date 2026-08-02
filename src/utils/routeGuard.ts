/**
 * Where the root layout should send the user, or `null` to stay put.
 *
 * The "stay put" case is the whole point. An effect that calls
 * `router.replace()` unconditionally writes to expo-router's navigation store
 * on every pass, and each write re-renders the layout that scheduled it —
 * React gives up with "Maximum update depth exceeded". Deciding first, and
 * navigating only on a real mismatch, makes the guard idempotent.
 */
export type RouteDecision = '/setup' | null;

export function redirectTarget({
  hasConnection,
  rootSegment,
}: {
  hasConnection: boolean;
  /** First path segment, from expo-router's `useSegments()`. */
  rootSegment: string | undefined;
}): RouteDecision {
  // No stored connection: nothing else in the app can do anything useful.
  // This is the only redirect the layout owns. It deliberately does not pull
  // a connected user *off* setup — that screen is also how an existing
  // connection is reconfigured, and it routes to chat itself once a new one
  // validates. Ejecting them on arrival would make the header's SETUP link
  // impossible to use.
  if (!hasConnection && rootSegment !== 'setup') return '/setup';

  return null;
}

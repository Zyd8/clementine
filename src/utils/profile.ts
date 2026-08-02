/**
 * Profile identity helpers — shared by stores.
 *
 * `ProfileId` is `string | null`: `null` is the no-profiles case (every
 * shipping Hermes today), a string is a named profile once multiplexing
 * profiles exist (Phase 3, parked). Both stores key their records by this,
 * so the type and the namespacing helper live here rather than in either
 * store (stores must not import stores).
 */

export type ProfileId = string | null;

const NULL_PROFILE = '\u0000default';

/** Namespacing key. The `\0` prefix cannot collide with a real profile id. */
export function profileKey(profileId: ProfileId): string {
  return profileId ?? NULL_PROFILE;
}

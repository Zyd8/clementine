import { ApiError, makeClient } from './client';

/**
 * Feature detection, and the gate the setup screen validates against.
 *
 * The shape here mirrors a *live* Hermes response, not an idealized one:
 * flags live under `features` with snake_case names (`run_submission`,
 * `run_events_sse`, …), and the envelope identifies itself via
 * `object: "hermes.api_server.capabilities"`. We normalize that into the few
 * booleans the client actually branches on, so a backend rename touches one
 * file.
 */

export const CAPABILITIES_PATH = '/v1/capabilities';

export type Capabilities = {
  platform: string;
  supportsRuns: boolean;
  supportsSse: boolean;
  supportsSessions: boolean;
  supportsApproval: boolean;
  /** No shipping Hermes advertises this yet — see Profiles in ARCHITECTURE.md. */
  supportsProfiles: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Something answered on the URL — is it actually a Hermes API server? */
function looksLikeHermes(body: Record<string, unknown>): boolean {
  const object = typeof body.object === 'string' ? body.object : '';
  const platform = typeof body.platform === 'string' ? body.platform : '';
  return object.startsWith('hermes.') || platform.startsWith('hermes');
}

export function parseCapabilities(body: unknown): Capabilities {
  if (!isRecord(body) || !looksLikeHermes(body)) {
    throw new ApiError('not-hermes');
  }

  const features = isRecord(body.features) ? body.features : {};
  const flag = (name: string): boolean => features[name] === true;

  return {
    platform: typeof body.platform === 'string' ? body.platform : 'unknown',
    supportsRuns: flag('run_submission'),
    supportsSse: flag('run_events_sse'),
    supportsSessions: flag('session_chat') || flag('session_resources'),
    supportsApproval: flag('run_approval_response'),
    supportsProfiles: flag('profiles'),
  };
}

/**
 * The setup screen's fail-fast check: wrong key, unreachable host, and
 * "reachable but not Hermes" all arrive as distinct `ApiError.kind`s.
 */
export async function validateConnection(
  baseUrl: string,
  credential: string,
): Promise<Capabilities> {
  const body = await makeClient(baseUrl, credential).get<unknown>(CAPABILITIES_PATH);
  return parseCapabilities(body);
}

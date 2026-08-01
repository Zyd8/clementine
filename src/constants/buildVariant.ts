/**
 * Build variant + the network policy that hangs off it.
 *
 * Cleartext HTTP exists for exactly one reason: in development the phone talks
 * to a Hermes on the dev laptop over a LAN IP, `10.0.2.2` (Android emulator),
 * or a Tailscale IP — none of which terminate TLS. Production builds must
 * never carry that allowance, so the decision lives in one tested function
 * rather than being hand-toggled in `app.json`.
 */
export type BuildVariant = 'development' | 'preview' | 'production';

const VARIANTS: readonly BuildVariant[] = ['development', 'preview', 'production'];

/** Resolves the variant from env, defaulting to `development` when unset. */
export function resolveBuildVariant(value: string | undefined): BuildVariant {
  return VARIANTS.includes(value as BuildVariant)
    ? (value as BuildVariant)
    : 'development';
}

/**
 * Cleartext is allowed in development and preview (both target a local Hermes
 * over LAN/Tailscale); never in production, which reaches the instance through
 * a TLS-terminating reverse proxy.
 */
export function allowsCleartextTraffic(variant: BuildVariant): boolean {
  return variant !== 'production';
}

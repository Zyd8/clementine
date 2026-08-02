/**
 * Token counts as the design writes them: `142.3K tok`, `450 tok`.
 *
 * Truncated rather than rounded — a usage readout that rounds up reports
 * spend the user has not made.
 */
export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0 tok';
  if (count < 1000) return `${Math.floor(count)} tok`;
  return `${(Math.floor(count / 100) / 10).toFixed(1)}K tok`;
}

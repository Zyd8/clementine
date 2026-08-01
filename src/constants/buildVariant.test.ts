import { allowsCleartextTraffic, resolveBuildVariant } from './buildVariant';

describe('resolveBuildVariant', () => {
  it.each(['development', 'preview', 'production'] as const)(
    'passes through the known variant %s',
    (variant) => {
      expect(resolveBuildVariant(variant)).toBe(variant);
    },
  );

  it('defaults to development when unset', () => {
    expect(resolveBuildVariant(undefined)).toBe('development');
  });

  it('defaults to development for an unrecognised value', () => {
    expect(resolveBuildVariant('staging')).toBe('development');
  });
});

describe('allowsCleartextTraffic', () => {
  it('allows cleartext in development (LAN / 10.0.2.2 / Tailscale have no TLS)', () => {
    expect(allowsCleartextTraffic('development')).toBe(true);
  });

  it('allows cleartext in preview builds, which also target a local Hermes', () => {
    expect(allowsCleartextTraffic('preview')).toBe(true);
  });

  it('never allows cleartext in production', () => {
    expect(allowsCleartextTraffic('production')).toBe(false);
  });

  it('denies cleartext for anything that resolved to production from env', () => {
    expect(allowsCleartextTraffic(resolveBuildVariant('production'))).toBe(false);
  });
});

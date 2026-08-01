import { darkTheme, lightTheme } from './theme';

describe('theme tokens', () => {
  it('pins the dark palette to the exact DESIGN.md Gold Focus values', () => {
    expect(darkTheme.colors).toMatchObject({
      canvas: '#1a1d23',
      canvasRaised: '#23272f',
      gold: '#f0a030',
      goldDim: '#c8872a',
      steel: '#2c3e50',
      ink: '#e8e6e3',
      inkMuted: '#8a8f98',
      ok: '#6abf69',
      err: '#e06c75',
    });
  });

  it('keeps gold identical across schemes — it is a state signal, not a color choice', () => {
    expect(lightTheme.colors.gold).toBe(darkTheme.colors.gold);
    expect(lightTheme.colors.goldDim).toBe(darkTheme.colors.goldDim);
  });

  it('keeps ok/err identical across schemes — tool outcomes read the same either way', () => {
    expect(lightTheme.colors.ok).toBe(darkTheme.colors.ok);
    expect(lightTheme.colors.err).toBe(darkTheme.colors.err);
  });

  it('inverts canvas and ink for light without going pure white or pure black', () => {
    expect(lightTheme.colors.canvas).not.toBe(darkTheme.colors.canvas);
    expect(lightTheme.colors.canvas.toLowerCase()).not.toBe('#ffffff');
    expect(lightTheme.colors.ink.toLowerCase()).not.toBe('#000000');
  });

  it('exposes the same token keys in both schemes so no component can 404 a token', () => {
    expect(Object.keys(lightTheme.colors).sort()).toEqual(
      Object.keys(darkTheme.colors).sort(),
    );
  });

  it('names its scheme', () => {
    expect(darkTheme.scheme).toBe('dark');
    expect(lightTheme.scheme).toBe('light');
  });

  it('uses only 4px and 8px radii, plus full-round reserved for the mic button', () => {
    expect(darkTheme.radius.sm).toBe(4);
    expect(darkTheme.radius.md).toBe(8);
    expect(darkTheme.radius.full).toBe(9999);
  });

  it('exposes the 4/8/16/24 spacing scale', () => {
    expect(darkTheme.spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24 });
  });

  it('is monospace-first in every type role', () => {
    const roles = ['display', 'heading', 'body', 'mono'] as const;
    for (const role of roles) {
      expect(darkTheme.typography[role].fontFamily).toMatch(/mono/i);
      expect(typeof darkTheme.typography[role].fontSize).toBe('number');
    }
  });
});

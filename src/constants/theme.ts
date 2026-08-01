/**
 * Gold Focus design tokens (see DESIGN.md).
 *
 * The dark palette is the canonical one — it is the design system as
 * specified, and the values here are pinned by test. The light palette is a
 * derived counterpart required by ARCHITECTURE.md's theming section:
 * DESIGN.md only specifies dark, so light inverts the canvas/ink axis while
 * holding the *semantic* colors (gold, ok, err) fixed. Gold means "the agent
 * is working" in both schemes; changing it per-scheme would break the one
 * thing the design language actually encodes.
 *
 * No component hardcodes a color — everything reads these tokens through
 * `useTheme()`.
 */

export type ThemeScheme = 'light' | 'dark';

export type TypeToken = {
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  lineHeight: number;
};

export type Theme = {
  scheme: ThemeScheme;
  colors: {
    canvas: string;
    canvasRaised: string;
    gold: string;
    goldDim: string;
    steel: string;
    ink: string;
    inkMuted: string;
    ok: string;
    err: string;
  };
  spacing: { xs: number; sm: number; md: number; lg: number };
  radius: { sm: number; md: number; full: number };
  typography: {
    display: TypeToken;
    heading: TypeToken;
    body: TypeToken;
    mono: TypeToken;
  };
};

/** JetBrains Mono is the intended face; the fallback keeps it monospace. */
const MONO = 'JetBrainsMono-Regular, monospace';

const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;

/** 4px chips/tool lines, 8px cards/bubbles, full-round for the mic button only. */
const radius = { sm: 4, md: 8, full: 9999 } as const;

/** rem values from DESIGN.md converted at a 16px base. */
const typography = {
  display: { fontFamily: MONO, fontSize: 32, fontWeight: '700', lineHeight: 38 },
  heading: { fontFamily: MONO, fontSize: 20, fontWeight: '600', lineHeight: 26 },
  body: { fontFamily: MONO, fontSize: 15, fontWeight: '400', lineHeight: 23 },
  mono: { fontFamily: MONO, fontSize: 14, fontWeight: '400', lineHeight: 20 },
} as const satisfies Theme['typography'];

/** Semantic colors that must not drift between schemes. */
const signal = {
  gold: '#f0a030',
  goldDim: '#c8872a',
  ok: '#6abf69',
  err: '#e06c75',
} as const;

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: {
    canvas: '#1a1d23',
    canvasRaised: '#23272f',
    steel: '#2c3e50',
    ink: '#e8e6e3',
    inkMuted: '#8a8f98',
    ...signal,
  },
  spacing,
  radius,
  typography,
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: {
    // Warm off-white rather than pure white, mirroring "never pure black".
    canvas: '#f5f3f0',
    canvasRaised: '#e7e4df',
    // Steel stays the idle border color; lightened to hold contrast on paper.
    steel: '#8b9bab',
    ink: '#23272f',
    inkMuted: '#6b7280',
    ...signal,
  },
  spacing,
  radius,
  typography,
};

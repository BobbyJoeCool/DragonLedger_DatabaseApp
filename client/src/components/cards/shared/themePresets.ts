import type { CSSProperties } from 'react'

// Card theme token schema — Documentation/phase-8-card-theming-final-export.md §1.2.
// 5 colors + 2 font slots. Applied as CSS custom properties (--card-*, not
// --accent/--muted etc.) so this never collides with the app-wide shadcn
// theme tokens defined in index.css — cards are printable documents with
// their own palette, independent of the app chrome around them.
//
// Split out from ThemeProvider.tsx (rather than co-located there) because
// this file's exports are plain values/types, not components — keeping
// them in the same file as CardThemeProvider trips the
// react-refresh/only-export-components lint rule.
export interface CardThemeTokens {
  bg: string
  accent: string
  ink: string
  muted: string
  rule: string
  fontDisplay: string
  fontBody: string
}

export type LockedCardThemeName = 'parchment' | 'scribe' | 'grimoire'
export type CardThemeName = LockedCardThemeName | 'custom'

// Webfont files are bundled via @fontsource packages (Almendra SC,
// Cinzel, EB Garamond). IBM Plex Sans is not yet installed — Scribe's
// Copy falls back to generic sans-serif until it is.
export const CARD_THEME_PRESETS: Record<LockedCardThemeName, CardThemeTokens> = {
  parchment: {
    bg: '#E4D5A7',
    accent: '#7A1E1E',
    ink: '#2A1B0F',
    muted: '#6B5A3E',
    rule: '#7A1E1E',
    fontDisplay: '"Almendra SC", serif',
    fontBody: '"EB Garamond", serif',
  },
  scribe: {
    bg: '#FFFFFF',
    accent: '#1F3A5F',
    ink: '#1A1A1A',
    muted: '#6B7280',
    rule: '#1F3A5F',
    fontDisplay: '"IBM Plex Sans", sans-serif',
    fontBody: '"EB Garamond", serif',
  },
  grimoire: {
    bg: '#0A0A0A',
    accent: '#D3A94E',
    ink: '#EDE6D6',
    muted: '#8A8270',
    rule: '#D3A94E',
    fontDisplay: '"Cinzel", serif',
    fontBody: '"EB Garamond", serif',
  },
}

// A custom theme is deliberately closest to Scribe's Copy structurally
// (plain shell, no texture, outlined corner tab) — only the 5 color slots
// change; fonts stay the safe default. The settings surface for building
// one doesn't exist yet (flagged out of scope, §4 item 1 / §6 item 7 of
// the handoff doc) — this type only describes the data shape a future
// settings UI would produce.
export type CustomCardTheme = Pick<CardThemeTokens, 'bg' | 'accent' | 'ink' | 'muted' | 'rule'>

export function resolveCardThemeTokens(
  theme: CardThemeName,
  customTokens?: CustomCardTheme,
): CardThemeTokens {
  if (theme === 'custom') {
    const base = CARD_THEME_PRESETS.scribe
    return { ...base, ...customTokens }
  }
  return CARD_THEME_PRESETS[theme]
}

export function cardThemeTokensToCssVars(tokens: CardThemeTokens): CSSProperties {
  return {
    '--card-bg': tokens.bg,
    '--card-accent': tokens.accent,
    '--card-ink': tokens.ink,
    '--card-muted': tokens.muted,
    '--card-rule': tokens.rule,
    '--card-font-display': tokens.fontDisplay,
    '--card-font-body': tokens.fontBody,
  } as CSSProperties
}

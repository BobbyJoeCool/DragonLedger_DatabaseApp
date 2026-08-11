import type { ReactNode } from 'react'
import { cardThemeTokensToCssVars, resolveCardThemeTokens } from './themePresets'
import type { CardThemeName, CustomCardTheme } from './themePresets'

export interface CardThemeProviderProps {
  theme: CardThemeName
  customTokens?: CustomCardTheme
  children: ReactNode
  className?: string
}

/**
 * Scopes the 5-color/2-font card theme token set (§1.2) over its children
 * as CSS custom properties, plus a `data-card-theme` attribute the shared
 * CSS (index.css) hooks for theme-specific structural differences that
 * aren't expressible as plain tokens: Parchment's turbulence texture,
 * Scribe's outlined (vs. filled) Subcard tab, and Grimoire's print-safe
 * light-fallback flip.
 */
export function CardThemeProvider({ theme, customTokens, children, className }: CardThemeProviderProps) {
  const tokens = resolveCardThemeTokens(theme, customTokens)
  const style = cardThemeTokensToCssVars(tokens)

  return (
    <div
      data-card-theme={theme}
      className={'dl-card-theme' + (className ? ` ${className}` : '')}
      style={style}
    >
      {theme === 'parchment' && <div className="dl-parchment-texture" aria-hidden="true" />}
      {children}
    </div>
  )
}

import type { CardThemeName } from './shared'

const THEME_OPTIONS: { value: CardThemeName; label: string }[] = [
  { value: 'parchment', label: 'Parchment' },
  { value: 'scribe', label: "Scribe's Copy" },
  { value: 'grimoire', label: 'Grimoire' },
]

interface ThemeSelectProps {
  value: CardThemeName
  onChange: (theme: CardThemeName) => void
}

// Session-local preset switcher for the 3 locked card themes — the real
// app-wide custom-theme-builder settings surface is explicitly out of
// scope for this phase (Documentation/phase-8-card-theming-final-export.md
// §4/§6); this just lets the 3 locked presets actually be seen/compared,
// which the doc's own visual-pass step needs anyway. Not persisted.
export function ThemeSelect({ value, onChange }: ThemeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CardThemeName)}
      className="rounded-md border bg-background px-2 py-2 text-sm"
      aria-label="Card theme"
    >
      {THEME_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

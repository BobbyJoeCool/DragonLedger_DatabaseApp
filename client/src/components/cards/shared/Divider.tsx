// Divider — §1.3. Two variants only: one tapered "major" divider used once
// per card (header -> body), and a plain "minor" section divider used for
// every other boundary. Deliberately not configurable beyond that — the
// design doc is explicit that a card never has more than these two kinds.
//
// The `suppressEdgeDividers` DOM pass that goes with this component lives
// in ./utils (a non-component export would trip the
// react-refresh/only-export-components lint rule if it stayed here).
export type DividerVariant = 'major' | 'minor'

export interface DividerProps {
  variant?: DividerVariant
  /**
   * A spanning divider (column-span:all inside a multi-column section) is
   * always a full-width block and is never suppressed by
   * suppressEdgeDividers — only non-spanning dividers can land on a column
   * edge and become redundant.
   */
  span?: boolean
  className?: string
}

export function Divider({ variant = 'minor', span = false, className }: DividerProps) {
  const classes = [
    'dl-divider',
    variant === 'major' ? 'dl-divider-major' : 'dl-divider-minor',
    span && 'dl-divider-span',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} role="separator" aria-hidden="true" />
}

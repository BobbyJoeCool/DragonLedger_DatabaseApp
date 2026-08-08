// ContentSpell.components (Phase 7 §4) — V/S/M checkboxes composed into the
// display string on save. `material`'s free-text description is a separate
// top-level Spell field (see the SpellForm template, phase-7-edit-create-ui-
// final-export.md §3) — not part of this widget.
const LETTERS: { key: 'V' | 'S' | 'M'; label: string }[] = [
  { key: 'V', label: 'Verbal' },
  { key: 'S', label: 'Somatic' },
  { key: 'M', label: 'Material' },
]

function parse(components: string): Set<string> {
  return new Set(
    components
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  )
}

function compose(letters: Set<string>): string {
  return LETTERS.filter(({ key }) => letters.has(key))
    .map(({ key }) => key)
    .join(', ')
}

interface ComponentsWidgetProps {
  value: string
  onChange: (next: string) => void
}

export function ComponentsWidget({ value, onChange }: ComponentsWidgetProps) {
  const active = parse(value)

  function toggle(letter: string) {
    const next = new Set(active)
    if (next.has(letter)) next.delete(letter)
    else next.add(letter)
    onChange(compose(next))
  }

  return (
    <div className="flex gap-4">
      {LETTERS.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={active.has(key)}
            onChange={() => toggle(key)}
            className="accent-primary"
          />
          {label} ({key})
        </label>
      ))}
    </div>
  )
}

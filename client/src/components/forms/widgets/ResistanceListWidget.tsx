import type { ResistanceEntry } from '@dragonledger/content-types'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard } from './styles'

// ContentMonster damageResistances/damageImmunities/damageVulnerabilities/
// conditionImmunities (Phase 7 §4) — the Phase 2.6-unified composite shape:
// a plain {types} list alongside the "B/P/S from nonmagical, unless
// [bypassedBy]" case, both represented the same way (nonmagical/bypassedBy
// always present, never a bare string), so every row uses one form, not two
// visually distinct row types.
interface ResistanceListWidgetProps {
  value: ResistanceEntry[]
  onChange: (next: ResistanceEntry[]) => void
}

export function ResistanceListWidget({ value, onChange }: ResistanceListWidgetProps) {
  function update(index: number, next: ResistanceEntry) {
    onChange(value.map((r, i) => (i === index ? next : r)))
  }

  return (
    <div className="space-y-2">
      {value.map((entry, i) => (
        <div key={i} className={rowCard}>
          <div>
            <p className={fieldLabel}>Types (comma-separated)</p>
            <input
              type="text"
              value={entry.types.join(', ')}
              onChange={(e) =>
                update(i, {
                  ...entry,
                  types: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              placeholder="fire, cold"
              className={fieldInput}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={entry.nonmagical}
                onChange={(e) => update(i, { ...entry, nonmagical: e.target.checked })}
                className="accent-primary"
              />
              From nonmagical attacks
            </label>
            <label className="flex flex-1 items-center gap-1 text-xs text-muted-foreground">
              Bypassed by
              <input
                type="text"
                value={entry.bypassedBy ?? ''}
                onChange={(e) => update(i, { ...entry, bypassedBy: e.target.value || null })}
                placeholder="e.g. silvered weapons"
                className={fieldInput}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className={removeButton}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { types: [], nonmagical: false, bypassedBy: null }])}
        className={primarySmallButton}
      >
        + Add entry
      </button>
    </div>
  )
}

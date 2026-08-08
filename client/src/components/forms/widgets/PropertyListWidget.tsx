import type { ItemProperty } from '@dragonledger/content-types'
import { fieldInput, primarySmallButton, removeButton } from './styles'

// ContentItem.properties (Phase 7 §4) — repeatable {name, detail?} rows.
// Known property names mirror server/src/importers/compendium/items.ts's
// PROPERTY_CODES value set; "detail" is only meaningful for Versatile
// (the paired two-handed damage die) per that importer's own handling, so
// it's hidden for every other property rather than always shown empty.
const KNOWN_PROPERTIES = [
  'Two-Handed',
  'Heavy',
  'Light',
  'Finesse',
  'Versatile',
  'Reach',
  'Loading',
  'Special',
  'Ammunition',
  'Thrown',
]

interface PropertyListWidgetProps {
  value: ItemProperty[]
  onChange: (next: ItemProperty[]) => void
}

export function PropertyListWidget({ value, onChange }: PropertyListWidgetProps) {
  function update(index: number, next: ItemProperty) {
    onChange(value.map((p, i) => (i === index ? next : p)))
  }

  return (
    <div className="space-y-1">
      {value.map((property, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={property.name}
            onChange={(e) => update(i, { name: e.target.value, detail: property.detail })}
            className={`${fieldInput} max-w-48`}
          >
            <option value="">Select a property…</option>
            {KNOWN_PROPERTIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {property.name && !KNOWN_PROPERTIES.includes(property.name) && (
              <option value={property.name}>{property.name} (custom)</option>
            )}
          </select>
          {property.name === 'Versatile' && (
            <input
              type="text"
              value={property.detail ?? ''}
              onChange={(e) => update(i, { ...property, detail: e.target.value })}
              placeholder="Two-handed damage (e.g. 1d10)"
              className={fieldInput}
            />
          )}
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
        onClick={() => onChange([...value, { name: '' }])}
        className={primarySmallButton}
      >
        + Add property
      </button>
    </div>
  )
}

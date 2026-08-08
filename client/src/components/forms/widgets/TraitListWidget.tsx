import type { RaceTrait } from '@dragonledger/content-types'
import { FixedChoiceGrantWidget } from './FixedChoiceGrantWidget'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, smallButton } from './styles'

// ContentRace/ContentSubrace/ContentClass/ContentSubclass traits/features
// (Phase 7 §4) — repeatable {name, description, level, grant?} rows; `grant`
// composes FixedChoiceGrantWidget. `grant` is a union of the two
// FixedChoiceGrant flavors (name-list vs. ability-bonus) — which one a
// given trait has is inferred from whether `fixed` is an array or a record,
// since the schema itself doesn't tag it.
interface TraitListWidgetProps {
  value: RaceTrait[]
  onChange: (next: RaceTrait[]) => void
}

export function TraitListWidget({ value, onChange }: TraitListWidgetProps) {
  function update(index: number, next: RaceTrait) {
    onChange(value.map((t, i) => (i === index ? next : t)))
  }

  return (
    <div className="space-y-2">
      {value.map((trait, i) => (
        <div key={i} className={rowCard}>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className={fieldLabel}>Name</p>
              <input
                type="text"
                value={trait.name}
                onChange={(e) => update(i, { ...trait, name: e.target.value })}
                className={fieldInput}
              />
            </div>
            <div className="w-24">
              <p className={fieldLabel}>Level</p>
              <input
                type="number"
                min={1}
                value={trait.level}
                onChange={(e) => update(i, { ...trait, level: Number(e.target.value) || 1 })}
                className={fieldInput}
              />
            </div>
          </div>
          <div>
            <p className={fieldLabel}>Description</p>
            <textarea
              value={trait.description}
              onChange={(e) => update(i, { ...trait, description: e.target.value })}
              rows={2}
              className={fieldInput}
            />
          </div>

          {trait.grant ? (
            <div className="space-y-1">
              {Array.isArray(trait.grant.fixed) ? (
                <FixedChoiceGrantWidget
                  fixedKind="list"
                  label="Grant"
                  value={trait.grant as Extract<typeof trait.grant, { fixed: unknown[] }>}
                  onChange={(grant) => update(i, { ...trait, grant })}
                />
              ) : (
                <FixedChoiceGrantWidget
                  fixedKind="abilityRecord"
                  label="Grant"
                  value={trait.grant as Extract<typeof trait.grant, { fixed: Record<string, number> }>}
                  onChange={(grant) => update(i, { ...trait, grant })}
                />
              )}
              <button
                type="button"
                onClick={() => update(i, { ...trait, grant: undefined })}
                className={removeButton}
              >
                Remove grant
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => update(i, { ...trait, grant: { fixed: [], choices: [] } })}
                className={smallButton}
              >
                + Add name/proficiency grant
              </button>
              <button
                type="button"
                onClick={() => update(i, { ...trait, grant: { fixed: {}, choices: [] } })}
                className={smallButton}
              >
                + Add ability-bonus grant
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className={removeButton}
          >
            Remove trait
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: '', description: '', level: 1 }])}
        className={primarySmallButton}
      >
        + Add trait
      </button>
    </div>
  )
}

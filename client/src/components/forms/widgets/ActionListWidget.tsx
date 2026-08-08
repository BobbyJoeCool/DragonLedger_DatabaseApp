import type { MonsterAction } from '@dragonledger/content-types'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard } from './styles'

const ACTION_TYPES: MonsterAction['actionType'][] = ['action', 'bonus', 'reaction', 'mythic']

// ContentMonster.actions/.legendaryActions (Phase 7 §4) — repeatable row
// editor; name/description/actionType/damage(+toHitMod), matching the
// composed-dice-string convention the importer already writes (e.g.
// "+5 to hit, 2d6+3 slashing"), not a structured dice breakdown.
interface ActionListWidgetProps {
  value: MonsterAction[]
  onChange: (next: MonsterAction[]) => void
}

export function ActionListWidget({ value, onChange }: ActionListWidgetProps) {
  function update(index: number, next: MonsterAction) {
    onChange(value.map((a, i) => (i === index ? next : a)))
  }

  return (
    <div className="space-y-2">
      {value.map((action, i) => (
        <div key={i} className={rowCard}>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className={fieldLabel}>Name</p>
              <input
                type="text"
                value={action.name}
                onChange={(e) => update(i, { ...action, name: e.target.value })}
                className={fieldInput}
              />
            </div>
            <div className="w-32">
              <p className={fieldLabel}>Type</p>
              <select
                value={action.actionType}
                onChange={(e) =>
                  update(i, { ...action, actionType: e.target.value as MonsterAction['actionType'] })
                }
                className={fieldInput}
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className={fieldLabel}>Description</p>
            <textarea
              value={action.description}
              onChange={(e) => update(i, { ...action, description: e.target.value })}
              rows={2}
              className={fieldInput}
            />
          </div>
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-muted-foreground">
              To-hit modifier
              <input
                type="number"
                value={action.toHitMod ?? ''}
                onChange={(e) =>
                  update(i, {
                    ...action,
                    toHitMod: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className={fieldInput}
              />
            </label>
            <label className="flex-1 text-xs text-muted-foreground">
              Damage (composed, e.g. "2d6+3 slashing")
              <input
                type="text"
                value={action.damage ?? ''}
                onChange={(e) => update(i, { ...action, damage: e.target.value || null })}
                className={fieldInput}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className={removeButton}
          >
            Remove action
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            { name: '', description: '', actionType: 'action', toHitMod: null, damage: null },
          ])
        }
        className={primarySmallButton}
      >
        + Add action
      </button>
    </div>
  )
}

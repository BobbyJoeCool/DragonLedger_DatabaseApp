import { fieldInput, smallButton } from './styles'

// ContentMonster.speed / ContentRace|ContentSubrace.speed (Phase 7 §4) —
// labeled number inputs per movement type, only showing populated ones by
// default with an "add movement type" affordance for the rest.
const MOVEMENT_TYPES = ['walk', 'fly', 'swim', 'climb', 'burrow', 'crawl']

interface SpeedWidgetProps {
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function SpeedWidget({ value, onChange }: SpeedWidgetProps) {
  const present = MOVEMENT_TYPES.filter((type) => type in value)
  const available = MOVEMENT_TYPES.filter((type) => !(type in value))

  function setSpeed(type: string, amount: number) {
    onChange({ ...value, [type]: amount })
  }

  function removeSpeed(type: string) {
    const next = { ...value }
    delete next[type]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {present.map((type) => (
          <label key={type} className="text-xs text-muted-foreground">
            {type[0]!.toUpperCase() + type.slice(1)}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={value[type] ?? 0}
                onChange={(e) => setSpeed(type, Number(e.target.value) || 0)}
                className={`${fieldInput} w-20`}
              />
              <button type="button" onClick={() => removeSpeed(type)} className="text-destructive">
                ✕
              </button>
            </div>
          </label>
        ))}
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSpeed(type, 0)}
              className={smallButton}
            >
              + {type[0]!.toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

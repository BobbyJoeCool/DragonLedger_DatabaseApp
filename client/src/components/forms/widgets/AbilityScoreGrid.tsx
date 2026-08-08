import { fieldInput } from './styles'

// ContentMonster.abilityScores (Phase 7 §4) — six labeled number inputs.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'strength', label: 'STR' },
  { key: 'dexterity', label: 'DEX' },
  { key: 'constitution', label: 'CON' },
  { key: 'intelligence', label: 'INT' },
  { key: 'wisdom', label: 'WIS' },
  { key: 'charisma', label: 'CHA' },
]

interface AbilityScoreGridProps {
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function AbilityScoreGrid({ value, onChange }: AbilityScoreGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {ABILITIES.map(({ key, label }) => (
        <label key={key} className="text-xs text-muted-foreground">
          {label}
          <input
            type="number"
            value={value[key] ?? 10}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) || 0 })}
            className={fieldInput}
          />
        </label>
      ))}
    </div>
  )
}

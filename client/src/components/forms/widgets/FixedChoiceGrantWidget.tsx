import type { FixedChoiceGrant, GradeEntry, GrantChoice } from '@dragonledger/content-types'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from './styles'

// The single most-reused JSON-shape widget (Phase 7 §4) — edits the
// Fixed/Choice Grant Shape used by skillChoices, proficiencies,
// abilityBonuses, and race/subrace trait `grant`. Two `fixed` shapes exist
// in the schema: a plain GradeEntry[] (skill/proficiency/trait grants) and
// a Record<ability, number> (ability-bonus grants) — `fixedKind` picks
// which editor renders for the "fixed" half, while the choices editor
// underneath (select/distribute) is shared between both.

type ListProps = {
  fixedKind: 'list'
  label: string
  value: FixedChoiceGrant<GradeEntry[]>
  onChange: (next: FixedChoiceGrant<GradeEntry[]>) => void
}

type AbilityRecordProps = {
  fixedKind: 'abilityRecord'
  label: string
  value: FixedChoiceGrant<Record<string, number>>
  onChange: (next: FixedChoiceGrant<Record<string, number>>) => void
}

export type FixedChoiceGrantWidgetProps = ListProps | AbilityRecordProps

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

function entryLabel(entry: GradeEntry): string {
  return typeof entry === 'string' ? entry : entry.name
}

function entryCategory(entry: GradeEntry): string {
  return typeof entry === 'string' ? '' : entry.category
}

function makeEntry(name: string, category: string): GradeEntry {
  return category.trim() ? { name, category: category.trim() } : name
}

interface GradeEntryListEditorProps {
  entries: GradeEntry[]
  onChange: (next: GradeEntry[]) => void
}

// Repeatable name (+ optional category tag) rows — used both for the
// `fixed` list and for a `select`/`distribute` choice's `from`/`among` list.
function GradeEntryListEditor({ entries, onChange }: GradeEntryListEditorProps) {
  function update(index: number, name: string, category: string) {
    const next = entries.slice()
    next[index] = makeEntry(name, category)
    onChange(next)
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={entryLabel(entry)}
            onChange={(e) => update(i, e.target.value, entryCategory(entry))}
            placeholder="Name"
            className={fieldInput}
          />
          <input
            type="text"
            value={entryCategory(entry)}
            onChange={(e) => update(i, entryLabel(entry), e.target.value)}
            placeholder="Category (optional)"
            className={`${fieldInput} max-w-40`}
          />
          <button
            type="button"
            onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
            className={removeButton}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...entries, ''])}
        className={primarySmallButton}
      >
        + Add entry
      </button>
    </div>
  )
}

interface ChoiceRowProps {
  choice: GrantChoice
  onChange: (next: GrantChoice) => void
  onRemove: () => void
}

function ChoiceRow({ choice, onChange, onRemove }: ChoiceRowProps) {
  return (
    <div className={rowCard}>
      <div className="flex items-center justify-between gap-2">
        <select
          value={choice.type}
          onChange={(e) => {
            const type = e.target.value as GrantChoice['type']
            onChange(
              type === 'select'
                ? { type: 'select', count: 1, from: null, amount: null }
                : { type: 'distribute', pool: 1, among: [], maxPerOption: 1 },
            )
          }}
          className={`${fieldInput} max-w-32`}
        >
          <option value="select">Select</option>
          <option value="distribute">Distribute</option>
        </select>
        <button type="button" onClick={onRemove} className={removeButton}>
          Remove choice
        </button>
      </div>

      {choice.type === 'select' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Count
              <input
                type="number"
                min={1}
                value={choice.count}
                onChange={(e) => onChange({ ...choice, count: Number(e.target.value) || 1 })}
                className={`${fieldInput} w-20`}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Amount (ability-bonus choices only)
              <input
                type="number"
                value={choice.amount ?? ''}
                onChange={(e) =>
                  onChange({ ...choice, amount: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={`${fieldInput} w-20`}
              />
            </label>
          </div>
          <div>
            <p className={fieldLabel}>
              From (leave empty for "any" — no fixed option list)
            </p>
            {choice.from === null ? (
              <button
                type="button"
                onClick={() => onChange({ ...choice, from: [] })}
                className={primarySmallButton}
              >
                + Add an option list
              </button>
            ) : (
              <GradeEntryListEditor
                entries={choice.from}
                onChange={(from) => onChange({ ...choice, from })}
              />
            )}
          </div>
        </div>
      )}

      {choice.type === 'distribute' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Pool
              <input
                type="number"
                min={1}
                value={choice.pool}
                onChange={(e) => onChange({ ...choice, pool: Number(e.target.value) || 1 })}
                className={`${fieldInput} w-20`}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Max per option
              <input
                type="number"
                min={1}
                value={choice.maxPerOption}
                onChange={(e) =>
                  onChange({ ...choice, maxPerOption: Number(e.target.value) || 1 })
                }
                className={`${fieldInput} w-20`}
              />
            </label>
          </div>
          <div>
            <p className={fieldLabel}>Among</p>
            <GradeEntryListEditor
              entries={choice.among}
              onChange={(among) => onChange({ ...choice, among })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface ChoicesEditorProps {
  choices: GrantChoice[]
  onChange: (next: GrantChoice[]) => void
}

function ChoicesEditor({ choices, onChange }: ChoicesEditorProps) {
  return (
    <div className="space-y-2">
      {choices.map((choice, i) => (
        <ChoiceRow
          key={i}
          choice={choice}
          onChange={(next) => onChange(choices.map((c, idx) => (idx === i ? next : c)))}
          onRemove={() => onChange(choices.filter((_, idx) => idx !== i))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...choices, { type: 'select', count: 1, from: null, amount: null }])}
        className={primarySmallButton}
      >
        + Add choice
      </button>
    </div>
  )
}

function AbilityBonusFixedEditor({
  fixed,
  onChange,
}: {
  fixed: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {ABILITY_KEYS.map((key) => (
        <label key={key} className="text-xs text-muted-foreground">
          {key.slice(0, 3).toUpperCase()}
          <input
            type="number"
            value={fixed[key] ?? 0}
            onChange={(e) => onChange({ ...fixed, [key]: Number(e.target.value) || 0 })}
            className={fieldInput}
          />
        </label>
      ))}
    </div>
  )
}

export function FixedChoiceGrantWidget(props: FixedChoiceGrantWidgetProps) {
  const { label } = props

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className={sectionTitle}>{label}</p>

      <div>
        <p className={fieldLabel}>Fixed</p>
        {props.fixedKind === 'list' ? (
          <GradeEntryListEditor
            entries={props.value.fixed}
            onChange={(fixed) => props.onChange({ ...props.value, fixed })}
          />
        ) : (
          <AbilityBonusFixedEditor
            fixed={props.value.fixed}
            onChange={(fixed) => props.onChange({ ...props.value, fixed })}
          />
        )}
      </div>

      <div>
        <p className={fieldLabel}>Choices</p>
        {props.fixedKind === 'list' ? (
          <ChoicesEditor
            choices={props.value.choices}
            onChange={(choices) => props.onChange({ ...props.value, choices })}
          />
        ) : (
          <ChoicesEditor
            choices={props.value.choices}
            onChange={(choices) => props.onChange({ ...props.value, choices })}
          />
        )}
      </div>
    </div>
  )
}

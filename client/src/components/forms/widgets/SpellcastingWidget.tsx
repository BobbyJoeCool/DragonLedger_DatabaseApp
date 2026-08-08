import { useContentNameIndex } from '@/hooks/useContentNameIndex'
import { defaultFilters } from '@/lib/contentQuery'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from './styles'

// extraData.spellcasting (Monster) — Phase 7 §4. Not a schema-enforced
// field (extraData is opaque JSON), so this shape mirrors the importer's
// own SpellcastingBlock (server/src/importers/open5e/monsters.ts) rather
// than a Zod-derived type. Spell-name fields use the same name-matching
// idea the importer already does for cross-referencing ContentSpell, here
// surfaced as a browser-native datalist autocomplete instead of free text.
export interface SpellcastingData {
  ability?: string
  saveDC?: number
  atWill?: string[]
  cantrips?: string[]
  limitedUse?: { frequency: string; spells: string[] }[]
  slots?: Record<string, string[]>
}

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
const DATALIST_ID = 'spellcasting-widget-spell-names'

function SpellNameInput({
  value,
  onChange,
  onRemove,
}: {
  value: string
  onChange: (next: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        list={DATALIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInput}
      />
      <button type="button" onClick={onRemove} className={removeButton}>
        Remove
      </button>
    </div>
  )
}

function SpellNameListEditor({
  spells,
  onChange,
}: {
  spells: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-1">
      {spells.map((name, i) => (
        <SpellNameInput
          key={i}
          value={name}
          onChange={(next) => onChange(spells.map((s, idx) => (idx === i ? next : s)))}
          onRemove={() => onChange(spells.filter((_, idx) => idx !== i))}
        />
      ))}
      <button type="button" onClick={() => onChange([...spells, ''])} className={primarySmallButton}>
        + Add spell
      </button>
    </div>
  )
}

interface SpellcastingWidgetProps {
  value: SpellcastingData
  onChange: (next: SpellcastingData) => void
}

export function SpellcastingWidget({ value, onChange }: SpellcastingWidgetProps) {
  const { data: spellNames } = useContentNameIndex('spells', defaultFilters())
  const slotLevels = Object.keys(value.slots ?? {})
  const nextSlotLevel = String(
    Math.max(0, ...slotLevels.map((l) => Number(l) || 0)) + 1,
  )

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className={sectionTitle}>Spellcasting</p>
      <datalist id={DATALIST_ID}>
        {(spellNames ?? []).map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Ability
          <select
            value={value.ability ?? ''}
            onChange={(e) => onChange({ ...value, ability: e.target.value || undefined })}
            className={fieldInput}
          >
            <option value="">—</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="w-32 text-xs text-muted-foreground">
          Save DC
          <input
            type="number"
            value={value.saveDC ?? ''}
            onChange={(e) =>
              onChange({ ...value, saveDC: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            className={fieldInput}
          />
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Cantrips</p>
        <SpellNameListEditor
          spells={value.cantrips ?? []}
          onChange={(cantrips) => onChange({ ...value, cantrips })}
        />
      </div>

      <div>
        <p className={fieldLabel}>At will</p>
        <SpellNameListEditor
          spells={value.atWill ?? []}
          onChange={(atWill) => onChange({ ...value, atWill })}
        />
      </div>

      <div className="space-y-2">
        <p className={fieldLabel}>Spell slots (by level)</p>
        {slotLevels.map((level) => (
          <div key={level} className={rowCard}>
            <p className="text-xs font-medium">Level {level}</p>
            <SpellNameListEditor
              spells={value.slots?.[level] ?? []}
              onChange={(spells) => onChange({ ...value, slots: { ...value.slots, [level]: spells } })}
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...value.slots }
                delete next[level]
                onChange({ ...value, slots: next })
              }}
              className={removeButton}
            >
              Remove level
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, slots: { ...value.slots, [nextSlotLevel]: [] } })
          }
          className={primarySmallButton}
        >
          + Add spell level
        </button>
      </div>

      <div className="space-y-2">
        <p className={fieldLabel}>Limited use (e.g. "3/day each")</p>
        {(value.limitedUse ?? []).map((entry, i) => (
          <div key={i} className={rowCard}>
            <input
              type="text"
              value={entry.frequency}
              onChange={(e) => {
                const next = (value.limitedUse ?? []).map((lu, idx) =>
                  idx === i ? { ...lu, frequency: e.target.value } : lu,
                )
                onChange({ ...value, limitedUse: next })
              }}
              placeholder="Frequency (e.g. 3/day each)"
              className={fieldInput}
            />
            <SpellNameListEditor
              spells={entry.spells}
              onChange={(spells) => {
                const next = (value.limitedUse ?? []).map((lu, idx) =>
                  idx === i ? { ...lu, spells } : lu,
                )
                onChange({ ...value, limitedUse: next })
              }}
            />
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  limitedUse: (value.limitedUse ?? []).filter((_, idx) => idx !== i),
                })
              }
              className={removeButton}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              limitedUse: [...(value.limitedUse ?? []), { frequency: '', spells: [] }],
            })
          }
          className={primarySmallButton}
        >
          + Add limited-use group
        </button>
      </div>
    </div>
  )
}

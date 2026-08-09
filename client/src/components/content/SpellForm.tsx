import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SpellSchema, type Spell } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { ComponentsWidget } from '@/components/forms/widgets/ComponentsWidget'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

// Follows the worked template in phase-7-edit-create-ui-final-export.md §3
// field-for-field, in the same order — the first per-type form built on
// top of the Phase 7 foundation layer.

const SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]

type SpellFormValues = Omit<Spell, 'slug'>

// slug is never a form field (locked, both create and edit) — generated
// from name on create, left untouched on edit.
const spellFormSchema = SpellSchema.omit({ slug: true })

function emptySpell(): SpellFormValues {
  return {
    sourceId: '',
    name: '',
    level: 0,
    school: '',
    castingTime: '',
    range: '',
    components: '',
    material: null,
    duration: '',
    concentration: false,
    ritual: false,
    classes: [],
    description: '',
    higherLevels: null,
    extraData: null,
  }
}

// extraData is opaque JSON (Documentation/card-design-spec.md §5.1) — this
// mirrors the subset the card surfaces under "Additional Details", not
// full parity with every mapping-table key, per the template's own note.
interface SpellExtraData {
  damageRoll?: string
  damageTypes?: string[]
  savingThrow?: string
  attackRoll?: boolean
  targetType?: string
  targetCount?: number
  shapeType?: string
  shapeSize?: number
  shapeSizeUnit?: string
  reactionCondition?: string
  materialCost?: string
  materialConsumed?: boolean
  scaling?: { trigger: string; triggerValue: number | null; dice: string; description: string | null }[]
}

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as SpellExtraData

  function set<K extends keyof SpellExtraData>(key: K, next: SpellExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || next === '' || next === null) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  const scaling = extra.scaling ?? []

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Damage roll
            <input
              type="text"
              value={extra.damageRoll ?? ''}
              onChange={(e) => set('damageRoll', e.target.value || undefined)}
              placeholder="e.g. 4d4"
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Saving throw
            <select
              value={extra.savingThrow ?? ''}
              onChange={(e) => set('savingThrow', e.target.value || undefined)}
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
        </div>

        <div>
          <p className={fieldLabel}>Damage types</p>
          <TagListWidget
            value={extra.damageTypes ?? []}
            onChange={(next) => set('damageTypes', next.length > 0 ? next : undefined)}
            placeholder="e.g. fire"
          />
        </div>

        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={extra.attackRoll ?? false}
            onChange={(e) => set('attackRoll', e.target.checked || undefined)}
            className="accent-primary"
          />
          Requires an attack roll
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Target type
            <input
              type="text"
              value={extra.targetType ?? ''}
              onChange={(e) => set('targetType', e.target.value || undefined)}
              placeholder="e.g. creature"
              className={fieldInput}
            />
          </label>
          <label className="w-24 text-xs text-muted-foreground">
            Count
            <input
              type="number"
              value={extra.targetCount ?? ''}
              onChange={(e) =>
                set('targetCount', e.target.value === '' ? undefined : Number(e.target.value))
              }
              className={fieldInput}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Area shape
            <input
              type="text"
              value={extra.shapeType ?? ''}
              onChange={(e) => set('shapeType', e.target.value || undefined)}
              placeholder="e.g. sphere"
              className={fieldInput}
            />
          </label>
          <label className="w-20 text-xs text-muted-foreground">
            Size
            <input
              type="number"
              value={extra.shapeSize ?? ''}
              onChange={(e) =>
                set('shapeSize', e.target.value === '' ? undefined : Number(e.target.value))
              }
              className={fieldInput}
            />
          </label>
          <label className="w-24 text-xs text-muted-foreground">
            Unit
            <input
              type="text"
              value={extra.shapeSizeUnit ?? ''}
              onChange={(e) => set('shapeSizeUnit', e.target.value || undefined)}
              placeholder="feet"
              className={fieldInput}
            />
          </label>
        </div>

        <label className="block text-xs text-muted-foreground">
          Reaction trigger
          <input
            type="text"
            value={extra.reactionCondition ?? ''}
            onChange={(e) => set('reactionCondition', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Material cost
            <input
              type="text"
              value={extra.materialCost ?? ''}
              onChange={(e) => set('materialCost', e.target.value || undefined)}
              placeholder="e.g. 25gp"
              className={fieldInput}
            />
          </label>
          <label className="flex items-center gap-1 self-end pb-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.materialConsumed ?? false}
              onChange={(e) => set('materialConsumed', e.target.checked || undefined)}
              className="accent-primary"
            />
            Consumed
          </label>
        </div>

        <div>
          <p className={fieldLabel}>Scaling</p>
          <div className="space-y-2">
            {scaling.map((entry, i) => (
              <div key={i} className={rowCard}>
                <div className="flex gap-2">
                  <select
                    value={entry.trigger}
                    onChange={(e) => {
                      const next = scaling.map((s, idx) =>
                        idx === i ? { ...s, trigger: e.target.value } : s,
                      )
                      set('scaling', next)
                    }}
                    className={`${fieldInput} max-w-40`}
                  >
                    <option value="slot_level">Slot level</option>
                    <option value="character_level">Character level</option>
                  </select>
                  <input
                    type="number"
                    value={entry.triggerValue ?? ''}
                    onChange={(e) => {
                      const next = scaling.map((s, idx) =>
                        idx === i
                          ? { ...s, triggerValue: e.target.value === '' ? null : Number(e.target.value) }
                          : s,
                      )
                      set('scaling', next)
                    }}
                    placeholder="Level/slot #"
                    className={`${fieldInput} w-28`}
                  />
                  <input
                    type="text"
                    value={entry.dice}
                    onChange={(e) => {
                      const next = scaling.map((s, idx) =>
                        idx === i ? { ...s, dice: e.target.value } : s,
                      )
                      set('scaling', next)
                    }}
                    placeholder="e.g. 2d6"
                    className={fieldInput}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => set('scaling', scaling.filter((_, idx) => idx !== i))}
                  className={removeButton}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                set('scaling', [...scaling, { trigger: 'slot_level', triggerValue: null, dice: '', description: null }])
              }
              className={primarySmallButton}
            >
              + Add scaling entry
            </button>
          </div>
        </div>
      </div>
    </details>
  )
}

interface SpellFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function SpellForm({ mode, id }: SpellFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('spells', mode === 'edit' ? id : undefined)
  const { data: sources } = useSources()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Flipped synchronously right before navigating away post-save, and read
  // live by UnsavedChangesGuard's blocker predicate — see that component
  // for why this has to be a ref (read at call time) rather than state
  // (a per-render snapshot that hasn't flushed yet when navigate() runs).
  const skipGuardRef = useRef(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { dirtyFields, isDirty },
  } = useForm<SpellFormValues>({
    resolver: zodResolver(spellFormSchema),
    defaultValues: emptySpell(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const spell = entry as unknown as Spell
    reset({
      sourceId: spell.sourceId,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      castingTime: spell.castingTime,
      range: spell.range,
      components: spell.components,
      material: spell.material,
      duration: spell.duration,
      concentration: spell.concentration,
      ritual: spell.ritual,
      classes: spell.classes,
      description: spell.description,
      higherLevels: spell.higherLevels,
      extraData: spell.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: SpellFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('spells'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/spells/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create spell.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof SpellFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('spells')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/spells/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save spell.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This spell no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="max-w-2xl space-y-4 rounded-md border p-6"
    >
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Spell' : 'Edit Spell'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <div className="flex gap-2">
        <label className="w-24 text-xs text-muted-foreground">
          Level
          <input
            type="number"
            min={0}
            max={9}
            {...register('level', { valueAsNumber: true })}
            className={fieldInput}
          />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          School
          <select {...register('school')} className={fieldInput}>
            <option value="">Select a school…</option>
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Casting time
          <input type="text" {...register('castingTime')} className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Range
          <input type="text" {...register('range')} className={fieldInput} />
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Components</p>
        <Controller
          name="components"
          control={control}
          render={({ field }) => <ComponentsWidget value={field.value} onChange={field.onChange} />}
        />
      </div>

      <label className="block text-xs text-muted-foreground">
        Material (if any)
        <input type="text" {...register('material')} className={fieldInput} />
      </label>

      <label className="block text-xs text-muted-foreground">
        Duration
        <input type="text" {...register('duration')} className={fieldInput} />
      </label>

      <div className="flex gap-4">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" {...register('concentration')} className="accent-primary" />
          Concentration
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" {...register('ritual')} className="accent-primary" />
          Ritual
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Classes</p>
        <Controller
          name="classes"
          control={control}
          render={({ field }) => (
            <TagListWidget value={field.value} onChange={field.onChange} placeholder="Add a class…" />
          )}
        />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
      </label>

      <label className="block text-xs text-muted-foreground">
        At Higher Levels
        <textarea rows={2} {...register('higherLevels')} className={fieldInput} />
      </label>

      <Controller
        name="extraData"
        control={control}
        render={({ field }) => (
          <AdvancedFields value={field.value ?? null} onChange={field.onChange} />
        )}
      />

      {mode === 'create' && (
        <div>
          <p className={fieldLabel}>Source</p>
          <Controller
            name="sourceId"
            control={control}
            render={({ field }) => <SourcePicker value={field.value} onChange={field.onChange} />}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <SaveButton
          contentType="spells"
          sourceType={sourceType}
          dirtyFields={dirtyFieldNames}
          saving={saving}
          onSave={(choice) => handleSubmit((values) => persist(values, choice))()}
        />
      </div>

      <UnsavedChangesGuard isDirty={isDirty} bypassRef={skipGuardRef} />
    </form>
  )
}

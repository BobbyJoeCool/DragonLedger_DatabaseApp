import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MonsterSchema, type Monster } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { AbilityScoreGrid } from '@/components/forms/widgets/AbilityScoreGrid'
import { SpeedWidget } from '@/components/forms/widgets/SpeedWidget'
import { ActionListWidget } from '@/components/forms/widgets/ActionListWidget'
import { ResistanceListWidget } from '@/components/forms/widgets/ResistanceListWidget'
import { SpellcastingWidget, type SpellcastingData } from '@/components/forms/widgets/SpellcastingWidget'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type MonsterFormValues = Omit<Monster, 'slug'>
const monsterFormSchema = MonsterSchema.omit({ slug: true })

function emptyMonster(): MonsterFormValues {
  return {
    sourceId: '',
    name: '',
    size: 'medium',
    monsterType: '',
    alignment: '',
    armorClass: 10,
    hitPoints: 10,
    hitDice: '',
    speed: { walk: 30 },
    abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    savingThrows: null,
    skills: null,
    damageResistances: null,
    damageImmunities: null,
    damageVulnerabilities: null,
    conditionImmunities: null,
    senses: null,
    languages: null,
    challengeRating: '',
    experiencePoints: 0,
    actions: [],
    legendaryActions: null,
    description: null,
    extraData: null,
  }
}

const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

// Generic key/number editor for savingThrows and skills — an open-ended
// key set (skill names), unlike AbilityScoreGrid's fixed 6.
function KeyValueNumberEditor({
  value,
  onChange,
  keySuggestions,
}: {
  value: Record<string, number> | null | undefined
  onChange: (next: Record<string, number> | null) => void
  keySuggestions?: string[]
}) {
  const entries = Object.entries(value ?? {})

  function update(next: [string, number][]) {
    const obj = Object.fromEntries(next)
    onChange(Object.keys(obj).length > 0 ? obj : null)
  }

  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            list={keySuggestions ? 'kv-suggestions' : undefined}
            value={k}
            onChange={(e) => {
              const next = entries.slice()
              next[i] = [e.target.value, v]
              update(next)
            }}
            placeholder="Name"
            className={`${fieldInput} max-w-40`}
          />
          <input
            type="number"
            value={v}
            onChange={(e) => {
              const next = entries.slice()
              next[i] = [k, Number(e.target.value) || 0]
              update(next)
            }}
            className={`${fieldInput} w-20`}
          />
          <button type="button" onClick={() => update(entries.filter((_, idx) => idx !== i))} className={removeButton}>
            Remove
          </button>
        </div>
      ))}
      {keySuggestions && (
        <datalist id="kv-suggestions">
          {keySuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <button type="button" onClick={() => update([...entries, ['', 0]])} className={primarySmallButton}>
        + Add
      </button>
    </div>
  )
}

interface NameDescriptionEntry {
  name: string
  description: string
}

function NameDescriptionListEditor({
  value,
  onChange,
}: {
  value: NameDescriptionEntry[]
  onChange: (next: NameDescriptionEntry[]) => void
}) {
  function update(index: number, next: NameDescriptionEntry) {
    onChange(value.map((v, i) => (i === index ? next : v)))
  }

  return (
    <div className="space-y-2">
      {value.map((entry, i) => (
        <div key={i} className={rowCard}>
          <input
            type="text"
            value={entry.name}
            onChange={(e) => update(i, { ...entry, name: e.target.value })}
            placeholder="Name"
            className={fieldInput}
          />
          <textarea
            value={entry.description}
            onChange={(e) => update(i, { ...entry, description: e.target.value })}
            rows={2}
            placeholder="Description"
            className={fieldInput}
          />
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className={removeButton}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { name: '', description: '' }])} className={primarySmallButton}>
        + Add
      </button>
    </div>
  )
}

interface MonsterExtraData {
  armorClassDetail?: string
  lairActions?: string[]
  traits?: NameDescriptionEntry[]
  spellcasting?: SpellcastingData
  proficiencyBonus?: number
  // A count (uses per day) — real data has both 0 and 3, so 0 is a
  // meaningful value here, not "absent."
  legendaryResistances?: number
  category?: string
  subcategory?: string
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as MonsterExtraData

  function set<K extends keyof MonsterExtraData>(key: K, next: MonsterExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || (Array.isArray(next) && next.length === 0)) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Armor class detail
            <input
              type="text"
              value={extra.armorClassDetail ?? ''}
              onChange={(e) => set('armorClassDetail', e.target.value || undefined)}
              placeholder="e.g. natural armor"
              className={fieldInput}
            />
          </label>
          <label className="w-32 text-xs text-muted-foreground">
            Proficiency bonus
            <input
              type="number"
              value={extra.proficiencyBonus ?? ''}
              onChange={(e) => set('proficiencyBonus', e.target.value === '' ? undefined : Number(e.target.value))}
              className={fieldInput}
            />
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Legendary resistances (uses per day)
          <input
            type="number"
            min={0}
            value={extra.legendaryResistances ?? ''}
            onChange={(e) => set('legendaryResistances', e.target.value === '' ? undefined : Number(e.target.value))}
            className={fieldInput}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Category
            <input
              type="text"
              value={extra.category ?? ''}
              onChange={(e) => set('category', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Subcategory
            <input
              type="text"
              value={extra.subcategory ?? ''}
              onChange={(e) => set('subcategory', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
        </div>
        <div>
          <p className={fieldLabel}>Traits</p>
          <NameDescriptionListEditor value={extra.traits ?? []} onChange={(next) => set('traits', next)} />
        </div>
        <div>
          <p className={fieldLabel}>Lair actions</p>
          <TagListWidget value={extra.lairActions ?? []} onChange={(next) => set('lairActions', next)} />
        </div>
        <div>
          <p className={fieldLabel}>Spellcasting</p>
          <SpellcastingWidget value={extra.spellcasting ?? {}} onChange={(next) => set('spellcasting', next)} />
        </div>
      </div>
    </details>
  )
}

interface MonsterFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function MonsterForm({ mode, id }: MonsterFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('monsters', mode === 'edit' ? id : undefined)
  const { data: sources } = useSources()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const skipGuardRef = useRef(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { dirtyFields, isDirty },
  } = useForm<MonsterFormValues>({
    resolver: zodResolver(monsterFormSchema),
    defaultValues: emptyMonster(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const monster = entry as unknown as Monster
    reset({
      sourceId: monster.sourceId,
      name: monster.name,
      size: monster.size,
      monsterType: monster.monsterType,
      alignment: monster.alignment,
      armorClass: monster.armorClass,
      hitPoints: monster.hitPoints,
      hitDice: monster.hitDice,
      speed: monster.speed,
      abilityScores: monster.abilityScores,
      savingThrows: monster.savingThrows,
      skills: monster.skills,
      damageResistances: monster.damageResistances,
      damageImmunities: monster.damageImmunities,
      damageVulnerabilities: monster.damageVulnerabilities,
      conditionImmunities: monster.conditionImmunities,
      senses: monster.senses,
      languages: monster.languages,
      challengeRating: monster.challengeRating,
      experiencePoints: monster.experiencePoints,
      actions: monster.actions,
      legendaryActions: monster.legendaryActions,
      description: monster.description,
      extraData: monster.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: MonsterFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('monsters'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/monsters/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create monster.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof MonsterFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('monsters')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/monsters/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save monster.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This monster no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Monster' : 'Edit Monster'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Size
          <select {...register('size')} className={fieldInput}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Type
          <input type="text" {...register('monsterType')} placeholder="e.g. dragon" className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Alignment
          <input type="text" {...register('alignment')} placeholder="e.g. neutral evil" className={fieldInput} />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Armor class
          <input type="number" {...register('armorClass', { valueAsNumber: true })} className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Hit points
          <input type="number" {...register('hitPoints', { valueAsNumber: true })} className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Hit dice
          <input type="text" {...register('hitDice')} placeholder="e.g. 2d6" className={fieldInput} />
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Speed</p>
        <Controller
          name="speed"
          control={control}
          render={({ field }) => (
            <SpeedWidget
              value={field.value as unknown as Record<string, number>}
              onChange={(next) => field.onChange(next)}
            />
          )}
        />
      </div>

      <div>
        <p className={fieldLabel}>Ability Scores</p>
        <Controller
          name="abilityScores"
          control={control}
          render={({ field }) => <AbilityScoreGrid value={field.value} onChange={field.onChange} />}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <p className={fieldLabel}>Saving throws</p>
          <Controller
            name="savingThrows"
            control={control}
            render={({ field }) => (
              <KeyValueNumberEditor value={field.value} onChange={field.onChange} keySuggestions={ABILITIES} />
            )}
          />
        </div>
        <div className="flex-1">
          <p className={fieldLabel}>Skills</p>
          <Controller
            name="skills"
            control={control}
            render={({ field }) => <KeyValueNumberEditor value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>

      <div>
        <p className={fieldLabel}>Damage Vulnerabilities</p>
        <Controller
          name="damageVulnerabilities"
          control={control}
          render={({ field }) => (
            <ResistanceListWidget value={field.value ?? []} onChange={(next) => field.onChange(next.length > 0 ? next : null)} />
          )}
        />
      </div>
      <div>
        <p className={fieldLabel}>Damage Resistances</p>
        <Controller
          name="damageResistances"
          control={control}
          render={({ field }) => (
            <ResistanceListWidget value={field.value ?? []} onChange={(next) => field.onChange(next.length > 0 ? next : null)} />
          )}
        />
      </div>
      <div>
        <p className={fieldLabel}>Damage Immunities</p>
        <Controller
          name="damageImmunities"
          control={control}
          render={({ field }) => (
            <ResistanceListWidget value={field.value ?? []} onChange={(next) => field.onChange(next.length > 0 ? next : null)} />
          )}
        />
      </div>
      <div>
        <p className={fieldLabel}>Condition Immunities</p>
        <Controller
          name="conditionImmunities"
          control={control}
          render={({ field }) => (
            <ResistanceListWidget value={field.value ?? []} onChange={(next) => field.onChange(next.length > 0 ? next : null)} />
          )}
        />
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Senses
          <input type="text" {...register('senses')} placeholder="e.g. darkvision 60 ft." className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Languages
          <input type="text" {...register('languages')} className={fieldInput} />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Challenge rating
          <input type="text" {...register('challengeRating')} placeholder="e.g. 1/8" className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Experience points
          <input type="number" {...register('experiencePoints', { valueAsNumber: true })} className={fieldInput} />
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Actions</p>
        <Controller
          name="actions"
          control={control}
          render={({ field }) => <ActionListWidget value={field.value} onChange={field.onChange} />}
        />
      </div>

      <div>
        <p className={fieldLabel}>Legendary Actions</p>
        <Controller
          name="legendaryActions"
          control={control}
          render={({ field }) => (
            <ActionListWidget value={field.value ?? []} onChange={(next) => field.onChange(next.length > 0 ? next : null)} />
          )}
        />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={4} {...register('description')} className={fieldInput} />
      </label>

      <Controller
        name="extraData"
        control={control}
        render={({ field }) => <AdvancedFields value={field.value ?? null} onChange={field.onChange} />}
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
          contentType="monsters"
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

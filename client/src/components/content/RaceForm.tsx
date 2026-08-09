import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RaceSchema, type Race } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { SpeedWidget } from '@/components/forms/widgets/SpeedWidget'
import { TraitListWidget } from '@/components/forms/widgets/TraitListWidget'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type RaceFormValues = Omit<Race, 'slug'>
const raceFormSchema = RaceSchema.omit({ slug: true })

function emptyRace(): RaceFormValues {
  return {
    sourceId: '',
    name: '',
    size: ['medium'],
    speed: { walk: 30 },
    traits: [],
    description: '',
    extraData: null,
    parentRaceId: null,
  }
}

interface RaceExtraData {
  rawAbility?: string
  creatureType?: string
  rawProficiency?: string
  rawResist?: string
  rawWeapons?: string
  otherTags?: string[]
}

function AdvancedFields({
  value,
  onChange,
  parentRaceId,
  onParentRaceIdChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
  parentRaceId: string | null | undefined
  onParentRaceIdChange: (next: string | null) => void
}) {
  const extra = (value ?? {}) as RaceExtraData

  function set<K extends keyof RaceExtraData>(key: K, next: RaceExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || (Array.isArray(next) && next.length === 0)) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-xs text-muted-foreground">
          Parent race ID (2014-style subspecies only — rare)
          <input
            type="text"
            value={parentRaceId ?? ''}
            onChange={(e) => onParentRaceIdChange(e.target.value || null)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Creature type
          <input
            type="text"
            value={extra.creatureType ?? ''}
            onChange={(e) => set('creatureType', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Ability (raw)
          <input
            type="text"
            value={extra.rawAbility ?? ''}
            onChange={(e) => set('rawAbility', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Proficiency (raw)
          <input
            type="text"
            value={extra.rawProficiency ?? ''}
            onChange={(e) => set('rawProficiency', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Resistance (raw)
          <input
            type="text"
            value={extra.rawResist ?? ''}
            onChange={(e) => set('rawResist', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <div>
          <p className={fieldLabel}>Other tags</p>
          <TagListWidget value={extra.otherTags ?? []} onChange={(next) => set('otherTags', next)} />
        </div>
      </div>
    </details>
  )
}

interface RaceFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function RaceForm({ mode, id }: RaceFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('races', mode === 'edit' ? id : undefined)
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
  } = useForm<RaceFormValues>({
    resolver: zodResolver(raceFormSchema),
    defaultValues: emptyRace(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const race = entry as unknown as Race
    reset({
      sourceId: race.sourceId,
      name: race.name,
      size: race.size,
      speed: race.speed,
      traits: race.traits,
      description: race.description,
      extraData: race.extraData,
      parentRaceId: race.parentRaceId,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: RaceFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('races'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/races/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create race.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof RaceFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('races')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/races/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save race.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This race no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Race' : 'Edit Race'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <div>
        <p className={fieldLabel}>Size</p>
        <Controller
          name="size"
          control={control}
          render={({ field }) => (
            <TagListWidget
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. medium"
              suggestions={['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']}
            />
          )}
        />
      </div>

      <div>
        <p className={fieldLabel}>Speed</p>
        <Controller
          name="speed"
          control={control}
          render={({ field }) => (
            <SpeedWidget value={field.value as unknown as Record<string, number>} onChange={(next) => field.onChange(next)} />
          )}
        />
      </div>

      <div>
        <p className={fieldLabel}>Traits</p>
        <Controller
          name="traits"
          control={control}
          render={({ field }) => <TraitListWidget value={field.value} onChange={field.onChange} />}
        />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
      </label>

      <Controller
        name="extraData"
        control={control}
        render={({ field: extraField }) => (
          <Controller
            name="parentRaceId"
            control={control}
            render={({ field: parentField }) => (
              <AdvancedFields
                value={extraField.value ?? null}
                onChange={extraField.onChange}
                parentRaceId={parentField.value}
                onParentRaceIdChange={parentField.onChange}
              />
            )}
          />
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
          contentType="races"
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

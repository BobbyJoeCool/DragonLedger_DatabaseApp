import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BackgroundSchema, type Background } from '@dragonledger/content-types'
import type { FixedChoiceGrant, GradeEntry } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { FixedChoiceGrantWidget } from '@/components/forms/widgets/FixedChoiceGrantWidget'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type BackgroundFormValues = Omit<Background, 'slug'>
const backgroundFormSchema = BackgroundSchema.omit({ slug: true })

function emptyBackground(): BackgroundFormValues {
  return {
    sourceId: '',
    name: '',
    proficiencies: { fixed: [], choices: [] },
    abilityBonuses: { fixed: {}, choices: [] },
    feature: [],
    description: '',
    extraData: null,
  }
}

interface NameDescriptionEntry {
  name: string
  description: string
}

// Shared by `feature[]` and Advanced Fields' `unrecognizedTraits` — both
// are the same {name, description} shape.
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
        onClick={() => onChange([...value, { name: '', description: '' }])}
        className={primarySmallButton}
      >
        + Add
      </button>
    </div>
  )
}

interface BackgroundExtraData {
  grantedFeat?: { name: string }
  equipment?: string
  unrecognizedTraits?: NameDescriptionEntry[]
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as BackgroundExtraData

  function set<K extends keyof BackgroundExtraData>(key: K, next: BackgroundExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || (Array.isArray(next) && next.length === 0)) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-xs text-muted-foreground">
          Granted feat name
          <input
            type="text"
            value={extra.grantedFeat?.name ?? ''}
            onChange={(e) => set('grantedFeat', e.target.value ? { name: e.target.value } : undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Equipment
          <textarea
            value={extra.equipment ?? ''}
            onChange={(e) => set('equipment', e.target.value || undefined)}
            rows={2}
            className={fieldInput}
          />
        </label>
        <div>
          <p className={fieldLabel}>Unrecognized traits</p>
          <NameDescriptionListEditor
            value={extra.unrecognizedTraits ?? []}
            onChange={(next) => set('unrecognizedTraits', next)}
          />
        </div>
      </div>
    </details>
  )
}

interface BackgroundFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function BackgroundForm({ mode, id }: BackgroundFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('backgrounds', mode === 'edit' ? id : undefined)
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
  } = useForm<BackgroundFormValues>({
    resolver: zodResolver(backgroundFormSchema),
    defaultValues: emptyBackground(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const background = entry as unknown as Background
    reset({
      sourceId: background.sourceId,
      name: background.name,
      proficiencies: background.proficiencies,
      abilityBonuses: background.abilityBonuses,
      feature: background.feature,
      description: background.description,
      extraData: background.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: BackgroundFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('backgrounds'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/backgrounds/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create background.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof BackgroundFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('backgrounds')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/backgrounds/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save background.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This background no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Background' : 'Edit Background'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <Controller
        name="proficiencies"
        control={control}
        render={({ field }) => (
          <FixedChoiceGrantWidget
            fixedKind="list"
            label="Proficiencies (skills/tools)"
            // proficiencies.fixed is always {name, category: 'skill'|'tool'}
            // (narrower than the generic GradeEntry shape) — the widget
            // works with the wider shape, so this boundary cast is safe
            // for existing data; a user leaving category blank on a new
            // entry will surface as a normal validation error on submit
            // rather than being silently accepted.
            value={field.value as unknown as FixedChoiceGrant<GradeEntry[]>}
            onChange={(next) => field.onChange(next)}
          />
        )}
      />

      <Controller
        name="abilityBonuses"
        control={control}
        render={({ field }) => (
          <FixedChoiceGrantWidget
            fixedKind="abilityRecord"
            label="Ability Bonuses"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <div>
        <p className={fieldLabel}>Feature</p>
        <Controller
          name="feature"
          control={control}
          render={({ field }) => (
            <NameDescriptionListEditor value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
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
          contentType="backgrounds"
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

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SubraceSchema, type Subrace } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useSources, type Source } from '@/hooks/useSources'
import { SpeedWidget } from '@/components/forms/widgets/SpeedWidget'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { TraitListWidget } from '@/components/forms/widgets/TraitListWidget'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

// Reached from /browse/races/:raceId/subraces/new (create) or
// /browse/subraces/:id/edit — not part of the top-level ContentType
// registry (Subrace is nested-only, per card-design-spec.md §5.5), so this
// talks to /api/subraces directly rather than through the generic
// apiPath()/useContentDetail() machinery.
type SubraceFormValues = Omit<Subrace, 'slug'>
const subraceFormSchema = SubraceSchema.omit({ slug: true })

function emptySubrace(raceId: string | null): SubraceFormValues {
  return { sourceId: '', raceId, name: '', description: null, size: null, speed: null, traits: [], extraData: null }
}

interface SubraceFormProps {
  mode: 'create' | 'edit'
}

export function SubraceForm({ mode }: SubraceFormProps) {
  const navigate = useNavigate()
  const { id, raceId } = useParams()
  const { data: sources } = useSources()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const skipGuardRef = useRef(false)

  const { data: entry, isLoading } = useQuery({
    queryKey: ['subrace-detail', id],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const res = await apiFetch(`/api/subraces/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to load subrace')
      return res.json() as Promise<Record<string, unknown>>
    },
    enabled: mode === 'edit' && Boolean(id),
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { dirtyFields, isDirty },
  } = useForm<SubraceFormValues>({
    resolver: zodResolver(subraceFormSchema),
    defaultValues: emptySubrace(raceId ?? null),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const subrace = entry as unknown as Subrace
    reset({
      sourceId: subrace.sourceId,
      raceId: subrace.raceId,
      name: subrace.name,
      description: subrace.description,
      size: subrace.size,
      speed: subrace.speed,
      traits: subrace.traits,
      extraData: subrace.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: SubraceFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch('/api/subraces', {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: values.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/subraces/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create subrace.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof SubraceFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`/api/subraces/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/subraces/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save subrace.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This subrace no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Subrace' : 'Edit Subrace'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description (leave blank to inherit parent's)
        <textarea rows={3} {...register('description')} className={fieldInput} />
      </label>

      <div>
        <p className={fieldLabel}>Size override (leave empty to inherit parent's)</p>
        <Controller
          name="size"
          control={control}
          render={({ field }) => (
            <TagListWidget
              value={field.value ?? []}
              onChange={(next) => field.onChange(next.length > 0 ? next : null)}
              placeholder="e.g. small"
              suggestions={['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']}
            />
          )}
        />
      </div>

      <div>
        <p className={fieldLabel}>Speed override (leave empty to inherit parent's)</p>
        <Controller
          name="speed"
          control={control}
          render={({ field }) =>
            field.value ? (
              <div className="space-y-1">
                <SpeedWidget
                  value={field.value as unknown as Record<string, number>}
                  onChange={(next) => field.onChange(next)}
                />
                <button
                  type="button"
                  onClick={() => field.onChange(null)}
                  className="text-xs text-destructive hover:underline"
                >
                  Clear override
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => field.onChange({ walk: 30 })}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
              >
                + Add speed override
              </button>
            )
          }
        />
      </div>

      <div>
        <p className={fieldLabel}>Traits (in addition to the parent race's)</p>
        <Controller
          name="traits"
          control={control}
          render={({ field }) => <TraitListWidget value={field.value} onChange={field.onChange} />}
        />
      </div>

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
          contentType="subraces"
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

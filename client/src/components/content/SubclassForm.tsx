import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SubclassSchema, type Subclass } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useSources, type Source } from '@/hooks/useSources'
import { slugify } from '@/lib/slugify'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

// Same nested-only pattern as SubraceForm — reached from
// /browse/classes/:classId/subclasses/new or /browse/subclasses/:id/edit.
type SubclassFormValues = Omit<Subclass, 'slug'>
const subclassFormSchema = SubclassSchema.omit({ slug: true })

function emptySubclass(classId: string | null): SubclassFormValues {
  return { sourceId: '', classId, name: '', description: '', extraData: null }
}

interface SubclassFormProps {
  mode: 'create' | 'edit'
}

export function SubclassForm({ mode }: SubclassFormProps) {
  const navigate = useNavigate()
  const { id, classId } = useParams()
  const { data: sources } = useSources()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const skipGuardRef = useRef(false)

  const { data: entry, isLoading } = useQuery({
    queryKey: ['subclass-detail', id],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const res = await apiFetch(`/api/subclasses/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to load subclass')
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
  } = useForm<SubclassFormValues>({
    resolver: zodResolver(subclassFormSchema),
    defaultValues: emptySubclass(classId ?? null),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const subclass = entry as unknown as Subclass
    reset({
      sourceId: subclass.sourceId,
      classId: subclass.classId,
      name: subclass.name,
      description: subclass.description,
      extraData: subclass.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: SubclassFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch('/api/subclasses', {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/subclasses/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create subclass.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof SubclassFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`/api/subclasses/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/subclasses/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save subclass.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This subclass no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Subclass' : 'Edit Subclass'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
      </label>

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
          contentType="subclasses"
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

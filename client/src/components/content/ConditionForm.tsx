import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ConditionSchema, type Condition } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type ConditionFormValues = Omit<Condition, 'slug'>
const conditionFormSchema = ConditionSchema.omit({ slug: true })

function emptyCondition(): ConditionFormValues {
  return { sourceId: '', name: '', description: '', effects: null, extraData: null }
}

interface ConditionExtraData {
  descriptionSource?: string
  requestedSource?: string
  icon?: string
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as ConditionExtraData

  function set<K extends keyof ConditionExtraData>(key: K, next: ConditionExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (!next) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-xs text-muted-foreground">
          Icon
          <input
            type="text"
            value={extra.icon ?? ''}
            onChange={(e) => set('icon', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Description Source
          <input
            type="text"
            value={extra.descriptionSource ?? ''}
            onChange={(e) => set('descriptionSource', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Requested Source
          <input
            type="text"
            value={extra.requestedSource ?? ''}
            onChange={(e) => set('requestedSource', e.target.value || undefined)}
            className={fieldInput}
          />
        </label>
      </div>
    </details>
  )
}

interface ConditionFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function ConditionForm({ mode, id }: ConditionFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('conditions', mode === 'edit' ? id : undefined)
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
  } = useForm<ConditionFormValues>({
    resolver: zodResolver(conditionFormSchema),
    defaultValues: emptyCondition(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const condition = entry as unknown as Condition
    reset({
      sourceId: condition.sourceId,
      name: condition.name,
      description: condition.description,
      effects: condition.effects,
      extraData: condition.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: ConditionFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('conditions'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/conditions/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create condition.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof ConditionFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('conditions')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/conditions/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save condition.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This condition no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Condition' : 'Edit Condition'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
      </label>

      <label className="block text-xs text-muted-foreground">
        Effects
        <textarea rows={2} {...register('effects')} className={fieldInput} />
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
          contentType="conditions"
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

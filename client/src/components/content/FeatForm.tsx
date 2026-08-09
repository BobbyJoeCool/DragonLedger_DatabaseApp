import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FeatSchema, type Feat } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

const CATEGORIES = ['GENERAL', 'ORIGIN', 'FIGHTING_STYLE', 'EPIC_BOON', 'CLASS_SPECIFIC']

type FeatFormValues = Omit<Feat, 'slug'>
const featFormSchema = FeatSchema.omit({ slug: true })

function emptyFeat(): FeatFormValues {
  return { sourceId: '', name: '', category: 'GENERAL', prerequisite: null, description: '', extraData: null }
}

interface FeatExtraData {
  edition?: string
  page?: string
  rawCategory?: string
  special?: string
  otherTags?: string[]
  thirdParty?: boolean
  unearthedArcana?: boolean
  homebrew?: boolean
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as FeatExtraData

  function set<K extends keyof FeatExtraData>(key: K, next: FeatExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || next === '' || next === null || (Array.isArray(next) && next.length === 0)) {
      delete updated[key]
    }
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Raw category
            <input
              type="text"
              value={extra.rawCategory ?? ''}
              onChange={(e) => set('rawCategory', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Special
            <input
              type="text"
              value={extra.special ?? ''}
              onChange={(e) => set('special', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Edition
            <input
              type="text"
              value={extra.edition ?? ''}
              onChange={(e) => set('edition', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
          <label className="w-24 text-xs text-muted-foreground">
            Page
            <input
              type="text"
              value={extra.page ?? ''}
              onChange={(e) => set('page', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
        </div>
        <div>
          <p className={fieldLabel}>Tags</p>
          <TagListWidget value={extra.otherTags ?? []} onChange={(next) => set('otherTags', next)} />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.thirdParty ?? false}
              onChange={(e) => set('thirdParty', e.target.checked || undefined)}
              className="accent-primary"
            />
            Third party
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.unearthedArcana ?? false}
              onChange={(e) => set('unearthedArcana', e.target.checked || undefined)}
              className="accent-primary"
            />
            Unearthed Arcana
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.homebrew ?? false}
              onChange={(e) => set('homebrew', e.target.checked || undefined)}
              className="accent-primary"
            />
            Homebrew
          </label>
        </div>
      </div>
    </details>
  )
}

interface FeatFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function FeatForm({ mode, id }: FeatFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('feats', mode === 'edit' ? id : undefined)
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
  } = useForm<FeatFormValues>({
    resolver: zodResolver(featFormSchema),
    defaultValues: emptyFeat(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const feat = entry as unknown as Feat
    reset({
      sourceId: feat.sourceId,
      name: feat.name,
      category: feat.category,
      prerequisite: feat.prerequisite,
      description: feat.description,
      extraData: feat.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: FeatFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('feats'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/feats/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create feat.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof FeatFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('feats')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/feats/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save feat.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This feat no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Feat' : 'Edit Feat'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <label className="block text-xs text-muted-foreground">
        Category
        <select {...register('category')} className={fieldInput}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-muted-foreground">
        Prerequisite
        <input type="text" {...register('prerequisite')} placeholder="e.g. Strength 13 or higher" className={fieldInput} />
      </label>

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={6} {...register('description')} className={fieldInput} />
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
          contentType="feats"
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

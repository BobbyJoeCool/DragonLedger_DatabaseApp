import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ItemSchema, type Item } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { PropertyListWidget } from '@/components/forms/widgets/PropertyListWidget'
import { fieldInput, fieldLabel, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type ItemFormValues = Omit<Item, 'slug'>
const itemFormSchema = ItemSchema.omit({ slug: true })

function emptyItem(): ItemFormValues {
  return {
    sourceId: '',
    name: '',
    itemType: '',
    rarity: null,
    requiresAttunement: false,
    cost: null,
    weight: null,
    damage: null,
    armorClass: null,
    properties: null,
    description: '',
    extraData: null,
  }
}

interface ItemExtraData {
  size?: string
  range?: string
  isSimple?: boolean
  isMartial?: boolean
  isImprovised?: boolean
  stealthDisadvantage?: boolean
  maxDexBonus?: number
  addDexMod?: boolean
  strRequired?: number
  acDisplay?: string
  attunementDetail?: string
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as ItemExtraData

  function set<K extends keyof ItemExtraData>(key: K, next: ItemExtraData[K]) {
    const updated = { ...extra, [key]: next }
    if (next === undefined || next === '' || next === null) delete updated[key]
    onChange(Object.keys(updated).length > 0 ? updated : null)
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Advanced Fields</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Size
            <input
              type="text"
              value={extra.size ?? ''}
              onChange={(e) => set('size', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Range
            <input
              type="text"
              value={extra.range ?? ''}
              onChange={(e) => set('range', e.target.value || undefined)}
              placeholder="e.g. 20/60"
              className={fieldInput}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Strength required
            <input
              type="number"
              value={extra.strRequired ?? ''}
              onChange={(e) => set('strRequired', e.target.value === '' ? undefined : Number(e.target.value))}
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Max Dex bonus
            <input
              type="number"
              value={extra.maxDexBonus ?? ''}
              onChange={(e) => set('maxDexBonus', e.target.value === '' ? undefined : Number(e.target.value))}
              className={fieldInput}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            AC display
            <input
              type="text"
              value={extra.acDisplay ?? ''}
              onChange={(e) => set('acDisplay', e.target.value || undefined)}
              placeholder="e.g. 18 + Dex modifier"
              className={fieldInput}
            />
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Attunement detail
          <input
            type="text"
            value={extra.attunementDetail ?? ''}
            onChange={(e) => set('attunementDetail', e.target.value || undefined)}
            placeholder="e.g. by a spellcaster"
            className={fieldInput}
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.isSimple ?? false}
              onChange={(e) => set('isSimple', e.target.checked || undefined)}
              className="accent-primary"
            />
            Simple weapon
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.isMartial ?? false}
              onChange={(e) => set('isMartial', e.target.checked || undefined)}
              className="accent-primary"
            />
            Martial weapon
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.isImprovised ?? false}
              onChange={(e) => set('isImprovised', e.target.checked || undefined)}
              className="accent-primary"
            />
            Improvised
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.stealthDisadvantage ?? false}
              onChange={(e) => set('stealthDisadvantage', e.target.checked || undefined)}
              className="accent-primary"
            />
            Stealth disadvantage
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={extra.addDexMod ?? false}
              onChange={(e) => set('addDexMod', e.target.checked || undefined)}
              className="accent-primary"
            />
            Adds Dex modifier
          </label>
        </div>
      </div>
    </details>
  )
}

interface ItemFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function ItemForm({ mode, id }: ItemFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('items', mode === 'edit' ? id : undefined)
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
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: emptyItem(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const item = entry as unknown as Item
    reset({
      sourceId: item.sourceId,
      name: item.name,
      itemType: item.itemType,
      rarity: item.rarity,
      requiresAttunement: item.requiresAttunement,
      cost: item.cost,
      weight: item.weight,
      damage: item.damage,
      armorClass: item.armorClass,
      properties: item.properties,
      description: item.description,
      extraData: item.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: ItemFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('items'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/items/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create item.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof ItemFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('items')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/items/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save item.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This item no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Item' : 'Edit Item'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Item type
          <input type="text" {...register('itemType')} placeholder="e.g. weapon, wondrous-item" className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Rarity
          <input type="text" {...register('rarity')} placeholder="e.g. rare" className={fieldInput} />
        </label>
      </div>

      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" {...register('requiresAttunement')} className="accent-primary" />
        Requires attunement
      </label>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Cost
          <input type="text" {...register('cost')} placeholder="e.g. 15 gp" className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Weight
          <input type="text" {...register('weight')} placeholder="e.g. 3 lb." className={fieldInput} />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-muted-foreground">
          Damage
          <input type="text" {...register('damage')} placeholder="e.g. 1d8 slashing" className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Armor class
          <input type="text" {...register('armorClass')} className={fieldInput} />
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Properties</p>
        <Controller
          name="properties"
          control={control}
          render={({ field }) => (
            <PropertyListWidget value={field.value ?? []} onChange={field.onChange} />
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
          contentType="items"
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

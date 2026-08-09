import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ClassSchema, type Class } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useContentDetail } from '@/hooks/useContentDetail'
import { useSources, type Source } from '@/hooks/useSources'
import { apiPath } from '@/lib/contentQuery'
import { slugify } from '@/lib/slugify'
import { TagListWidget } from '@/components/forms/widgets/TagListWidget'
import { FixedChoiceGrantWidget } from '@/components/forms/widgets/FixedChoiceGrantWidget'
import { fieldInput, fieldLabel, primarySmallButton, removeButton, rowCard, sectionTitle } from '@/components/forms/widgets/styles'
import { SourcePicker } from '@/components/forms/SourcePicker'
import { SaveButton } from '@/components/forms/SaveButton'
import { UnsavedChangesGuard } from '@/components/forms/UnsavedChangesGuard'
import type { SaveAsChoice } from '@/components/forms/SaveAsPrompt'

type ClassFormValues = Omit<Class, 'slug'>
const classFormSchema = ClassSchema.omit({ slug: true })

function emptyClass(): ClassFormValues {
  return {
    sourceId: '',
    name: '',
    hitDie: 8,
    primaryAbility: { abilities: [], logic: 'OR' },
    savingThrows: [],
    armorProfs: [],
    weaponProfs: [],
    skillChoices: { fixed: [], choices: [] },
    spellcastingAbility: null,
    description: '',
    extraData: null,
  }
}

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

// ContentClassOption (Metamagic/Eldritch Invocations/Maneuvers/etc.) has no
// standalone form (resolved decision, v1-roadmap-open-decisions.md §0.1) —
// edited inline here. Edit-mode only: a new Class has no id yet to attach
// classId to until the first save.
interface ClassOptionRow {
  id: string
  pool: string
  name: string
  description: string
  prerequisite?: string | null
}

function ClassOptionsEditor({ classId }: { classId: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Partial<ClassOptionRow> | null>(null)
  const [saving, setSaving] = useState(false)

  const { data } = useQuery({
    queryKey: ['class-options-of-class', classId],
    queryFn: async (): Promise<ClassOptionRow[]> => {
      const res = await apiFetch(`/api/class-options?classId=${classId}`)
      if (!res.ok) throw new Error('Failed to load class options')
      const body = (await res.json()) as { data: ClassOptionRow[] }
      return body.data
    },
  })

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ['class-options-of-class', classId] })
  }

  async function saveRow(row: Partial<ClassOptionRow>) {
    setSaving(true)
    try {
      if (row.id) {
        await apiFetch(`/api/class-options/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            pool: row.pool,
            name: row.name,
            description: row.description,
            prerequisite: row.prerequisite || null,
          }),
        })
      } else {
        await apiFetch('/api/class-options', {
          method: 'POST',
          body: JSON.stringify({
            classId,
            sourceId: 'homebrew',
            slug: slugify(row.name ?? ''),
            pool: row.pool || 'Metamagic',
            name: row.name,
            description: row.description ?? '',
            prerequisite: row.prerequisite || null,
          }),
        })
      }
      setDraft(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(id: string) {
    await apiFetch(`/api/class-options/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) })
    await refresh()
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Class Options (Metamagic / Invocations / Maneuvers)</summary>
      <div className="mt-3 space-y-2">
        {(data ?? []).map((row) => (
          <div key={row.id} className={rowCard}>
            <div className="flex gap-2">
              <input
                type="text"
                defaultValue={row.pool}
                onBlur={(e) => saveRow({ ...row, pool: e.target.value })}
                placeholder="Pool"
                className={`${fieldInput} max-w-40`}
              />
              <input
                type="text"
                defaultValue={row.name}
                onBlur={(e) => saveRow({ ...row, name: e.target.value })}
                placeholder="Name"
                className={fieldInput}
              />
            </div>
            <input
              type="text"
              defaultValue={row.prerequisite ?? ''}
              onBlur={(e) => saveRow({ ...row, prerequisite: e.target.value })}
              placeholder="Prerequisite (optional)"
              className={fieldInput}
            />
            <textarea
              defaultValue={row.description}
              onBlur={(e) => saveRow({ ...row, description: e.target.value })}
              rows={2}
              placeholder="Description"
              className={fieldInput}
            />
            <button type="button" onClick={() => deleteRow(row.id)} className={removeButton}>
              Remove
            </button>
          </div>
        ))}

        {draft ? (
          <div className={rowCard}>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.pool ?? ''}
                onChange={(e) => setDraft({ ...draft, pool: e.target.value })}
                placeholder="Pool (e.g. Metamagic)"
                className={`${fieldInput} max-w-40`}
              />
              <input
                type="text"
                value={draft.name ?? ''}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Name"
                className={fieldInput}
              />
            </div>
            <textarea
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              placeholder="Description"
              className={fieldInput}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !draft.name}
                onClick={() => saveRow(draft)}
                className={primarySmallButton}
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={removeButton}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft({ pool: 'Metamagic', name: '', description: '' })}
            className={primarySmallButton}
          >
            + Add class option
          </button>
        )}
      </div>
    </details>
  )
}

interface ClassExtraData {
  casterType?: string
  toolProfs?: string[]
  slotsReset?: string
}

function AdvancedFields({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null
  onChange: (next: Record<string, unknown> | null) => void
}) {
  const extra = (value ?? {}) as ClassExtraData

  function set<K extends keyof ClassExtraData>(key: K, next: ClassExtraData[K]) {
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
            Caster type
            <select
              value={extra.casterType ?? ''}
              onChange={(e) => set('casterType', e.target.value || undefined)}
              className={fieldInput}
            >
              <option value="">—</option>
              <option value="FULL">FULL</option>
              <option value="HALF">HALF</option>
              <option value="PACT">PACT</option>
              <option value="NONE">NONE</option>
            </select>
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Slots reset
            <input
              type="text"
              value={extra.slotsReset ?? ''}
              onChange={(e) => set('slotsReset', e.target.value || undefined)}
              className={fieldInput}
            />
          </label>
        </div>
        <div>
          <p className={fieldLabel}>Tool proficiencies</p>
          <TagListWidget value={extra.toolProfs ?? []} onChange={(next) => set('toolProfs', next)} />
        </div>
      </div>
    </details>
  )
}

interface ClassFormProps {
  mode: 'create' | 'edit'
  id?: string
}

export function ClassForm({ mode, id }: ClassFormProps) {
  const navigate = useNavigate()
  const { data: entry, isLoading } = useContentDetail('classes', mode === 'edit' ? id : undefined)
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
  } = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: emptyClass(),
  })

  useEffect(() => {
    if (mode !== 'edit' || !entry) return
    const cls = entry as unknown as Class
    reset({
      sourceId: cls.sourceId,
      name: cls.name,
      hitDie: cls.hitDie,
      primaryAbility: cls.primaryAbility,
      savingThrows: cls.savingThrows,
      armorProfs: cls.armorProfs,
      weaponProfs: cls.weaponProfs,
      skillChoices: cls.skillChoices,
      spellcastingAbility: cls.spellcastingAbility,
      description: cls.description,
      extraData: cls.extraData,
    })
  }, [mode, entry, reset])

  const sourceType: Source['type'] | null =
    mode === 'create'
      ? null
      : (sources?.find((s) => s.id === (entry?.sourceId as string | undefined))?.type ?? null)

  async function persist(values: ClassFormValues, choice?: SaveAsChoice) {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await apiFetch(apiPath('classes'), {
          method: 'POST',
          body: JSON.stringify({ ...values, slug: slugify(values.name) }),
        })
        if (res.status === 201) {
          const created = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/classes/${created.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create class.')
      } else {
        const payload: Record<string, unknown> = {}
        for (const key of Object.keys(dirtyFields)) {
          payload[key] = values[key as keyof ClassFormValues]
        }
        if (choice) {
          payload.saveAs = choice.saveAs
          if (choice.targetSourceId) payload.targetSourceId = choice.targetSourceId
        }
        const res = await apiFetch(`${apiPath('classes')}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const updated = (await res.json()) as { id: string }
          skipGuardRef.current = true
          navigate(`/browse/classes/${updated.id}`)
          return
        }
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to save class.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'edit' && isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (mode === 'edit' && entry === null) {
    return <p className="text-sm text-destructive">This class no longer exists.</p>
  }

  const dirtyFieldNames = Object.keys(dirtyFields)

  return (
    <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl space-y-4 rounded-md border p-6">
      <h2 className={sectionTitle}>{mode === 'create' ? 'New Class' : 'Edit Class'}</h2>

      <div>
        <p className={fieldLabel}>Name</p>
        <input type="text" {...register('name')} className={fieldInput} />
      </div>

      <div className="flex gap-2">
        <label className="w-24 text-xs text-muted-foreground">
          Hit die
          <input type="number" {...register('hitDie', { valueAsNumber: true })} className={fieldInput} />
        </label>
        <label className="flex-1 text-xs text-muted-foreground">
          Spellcasting ability
          <select {...register('spellcastingAbility')} className={fieldInput}>
            <option value="">— none —</option>
            {ABILITIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className={fieldLabel}>Primary ability</p>
        <div className="flex gap-2">
          <Controller
            name="primaryAbility.abilities"
            control={control}
            render={({ field }) => (
              <TagListWidget value={field.value} onChange={field.onChange} suggestions={ABILITIES} />
            )}
          />
          <Controller
            name="primaryAbility.logic"
            control={control}
            render={({ field }) => (
              <select value={field.value} onChange={(e) => field.onChange(e.target.value)} className={`${fieldInput} max-w-24`}>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
          />
        </div>
      </div>

      <div>
        <p className={fieldLabel}>Saving throws</p>
        <Controller
          name="savingThrows"
          control={control}
          render={({ field }) => (
            <TagListWidget value={field.value} onChange={field.onChange} suggestions={ABILITIES} />
          )}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <p className={fieldLabel}>Armor proficiencies</p>
          <Controller
            name="armorProfs"
            control={control}
            render={({ field }) => <TagListWidget value={field.value} onChange={field.onChange} />}
          />
        </div>
        <div className="flex-1">
          <p className={fieldLabel}>Weapon proficiencies</p>
          <Controller
            name="weaponProfs"
            control={control}
            render={({ field }) => <TagListWidget value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>

      <Controller
        name="skillChoices"
        control={control}
        render={({ field }) => (
          <FixedChoiceGrantWidget fixedKind="list" label="Skill Choices" value={field.value} onChange={field.onChange} />
        )}
      />

      <label className="block text-xs text-muted-foreground">
        Description
        <textarea rows={5} {...register('description')} className={fieldInput} />
      </label>

      <Controller
        name="extraData"
        control={control}
        render={({ field }) => <AdvancedFields value={field.value ?? null} onChange={field.onChange} />}
      />

      {mode === 'edit' && id && <ClassOptionsEditor classId={id} />}

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
          contentType="classes"
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

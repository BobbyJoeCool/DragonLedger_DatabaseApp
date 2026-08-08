import { useEffect, useState } from 'react'
import { useSources } from '@/hooks/useSources'
import { CreateSourceInlineDialog } from './CreateSourceInlineDialog'
import { fieldInput } from './widgets/styles'

interface SourcePickerProps {
  value: string
  onChange: (sourceId: string) => void
}

const NEW_SOURCE_VALUE = '__new__'

// Create-only (Phase 7 §1.7) — single-select sibling of Phase 5's
// SourceMultiSelect, filtered to MANUAL sources. Defaults to the seeded,
// non-deletable "homebrew" source once sources load, matching how
// `saveAs: "homebrew"` already resolves with no target specified.
export function SourcePicker({ value, onChange }: SourcePickerProps) {
  const { data: sources, isLoading } = useSources()
  const [creating, setCreating] = useState(false)
  const manualSources = (sources ?? []).filter((s) => s.type === 'MANUAL')

  useEffect(() => {
    if (value || isLoading) return
    const homebrew = manualSources.find((s) => s.id === 'homebrew')
    if (homebrew) onChange(homebrew.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, value])

  return (
    <div>
      <select
        value={value}
        disabled={isLoading}
        onChange={(e) => {
          if (e.target.value === NEW_SOURCE_VALUE) {
            setCreating(true)
            return
          }
          onChange(e.target.value)
        }}
        className={fieldInput}
      >
        {manualSources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SOURCE_VALUE}>+ New source…</option>
      </select>

      {creating && (
        <CreateSourceInlineDialog
          onClose={() => setCreating(false)}
          onCreated={(source) => {
            onChange(source.id)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { fieldInput } from './styles'

// Multi-select-style tag input for plain string[] fields (e.g.
// ContentSpell.classes) — not in the original Section 4 widget table, but
// needed by the SpellForm template (phase-7-edit-create-ui-final-export.md
// §3) and simple enough not to warrant its own design discussion.
interface TagListWidgetProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  suggestions?: string[]
}

export function TagListWidget({ value, onChange, placeholder, suggestions }: TagListWidgetProps) {
  const [draft, setDraft] = useState('')
  const datalistId = 'taglist-suggestions'

  function commitDraft() {
    const tag = draft.trim()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-muted-foreground hover:text-destructive"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        list={suggestions ? datalistId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commitDraft()
          }
        }}
        onBlur={commitDraft}
        placeholder={placeholder ?? 'Type and press Enter…'}
        className={fieldInput}
      />
      {suggestions && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}

const EDITIONS = [
  { value: '', label: 'All Editions' },
  { value: '5e', label: '5e' },
  { value: '5.5e', label: '5.5e' },
] as const

interface EditionToggleProps {
  value: string
  onChange: (edition: string) => void
}

export function EditionToggle({ value, onChange }: EditionToggleProps) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Edition filter">
      {EDITIONS.map((ed) => (
        <button
          key={ed.value}
          type="button"
          role="radio"
          aria-checked={value === ed.value}
          onClick={() => onChange(ed.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === ed.value
              ? 'bg-accent text-accent-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {ed.label}
        </button>
      ))}
    </div>
  )
}

interface NameSearchInputProps {
  value: string
  onChange: (value: string) => void
}

// Shared across all 8 filter bars (Decision 1.3) — wraps ?q=.
export function NameSearchInput({ value, onChange }: NameSearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search by name…"
      className="w-56 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

export type ImportKind = 'open5e' | 'compendium' | 'json'

interface Step1ChooseTypeProps {
  onChoose: (kind: ImportKind) => void
}

const OPTIONS: { kind: ImportKind; title: string; description: string }[] = [
  { kind: 'open5e', title: 'Open5e API', description: 'Import SRD content directly from the Open5e API.' },
  {
    kind: 'compendium',
    title: 'Compendium XML',
    description: 'Import from a Fight Club 5e Compendium XML file.',
  },
  { kind: 'json', title: 'JSON File', description: 'Import your own content from a JSON file.' },
]

// Three options, not two (outline.md §6.2 revision) — Compendium XML needs
// its own step, distinct from a generic JSON file.
export function Step1ChooseType({ onChoose }: Step1ChooseTypeProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((option) => (
        <button
          key={option.kind}
          type="button"
          onClick={() => onChoose(option.kind)}
          className="rounded-md border p-4 text-left hover:bg-accent"
        >
          <h3 className="font-medium">{option.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
        </button>
      ))}
    </div>
  )
}

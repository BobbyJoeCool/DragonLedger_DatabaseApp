import { useState } from 'react'
import { apiFetch } from '@/api/client'
import { isElectron, selectFile } from '@/lib/electronApi'
import { Step3Progress } from './Step3Progress'

interface Step2CompendiumProps {
  onBack: () => void
  onDone: () => void
}

// The backend always imports this same fixed set — no filtering option
// exists, so no checkboxes here (Phase 6 Decision 1.5): showing selectable
// checkboxes would imply a choice that doesn't exist.
const COMPENDIUM_TYPES_LABEL = 'Classes, Races, Backgrounds, Feats, Items, Spells, Monsters'

export function Step2Compendium({ onBack, onDone }: Step2CompendiumProps) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function handlePickFile() {
    setError('')
    try {
      const path = await selectFile([{ name: 'Compendium XML', extensions: ['xml'] }])
      if (path) setFilePath(path)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleStart() {
    if (!filePath) return
    setStarting(true)
    setError('')
    const res = await apiFetch('/api/import/compendium', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    })
    if (res.status === 202) {
      const body = await res.json()
      setJobId(body.jobId)
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to start import.')
      setStarting(false)
    }
  }

  if (jobId) {
    return <Step3Progress jobId={jobId} onDone={onDone} />
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:underline">
        ← Back
      </button>
      <div>
        <p className="text-sm font-medium">This will import:</p>
        <p className="text-sm text-muted-foreground">{COMPENDIUM_TYPES_LABEL}</p>
      </div>
      {isElectron() ? (
        <button
          type="button"
          onClick={handlePickFile}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          {filePath ? 'Change file…' : 'Choose Compendium XML file…'}
        </button>
      ) : (
        <p className="text-sm text-destructive">The file picker is only available in the desktop app.</p>
      )}
      {filePath && (
        <p className="truncate text-sm text-muted-foreground" title={filePath}>
          {filePath}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleStart}
        disabled={!filePath || starting}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Start Import'}
      </button>
    </div>
  )
}

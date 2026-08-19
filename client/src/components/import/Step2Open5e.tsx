import { useState } from 'react'
import { apiFetch } from '@/api/client'
import { Step3Progress } from './Step3Progress'

interface Step2Open5eProps {
  onBack: () => void
  onDone: () => void
}

const CONTENT_TYPES = [
  { value: 'CONDITION', label: 'Conditions' },
  { value: 'SPELL', label: 'Spells' },
  { value: 'RACE', label: 'Races' },
  { value: 'CLASS', label: 'Classes' },
  { value: 'BACKGROUND', label: 'Backgrounds' },
  { value: 'ITEM', label: 'Items' },
  { value: 'MONSTER', label: 'Monsters' },
] as const

const EDITION_PRESETS = {
  '5.5e': { sourceId: 'open5e-srd-2024', sourceName: 'Open5e SRD 2024', documentKey: 'srd-2024' },
  '5e': { sourceId: 'open5e-srd-2014', sourceName: 'Open5e SRD 2014', documentKey: 'srd-2014' },
} as const

type Edition = '5e' | '5.5e'

const inputClass = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function Step2Open5e({ onBack, onDone }: Step2Open5eProps) {
  const [edition, setEdition] = useState<Edition>('5.5e')
  const [sourceId, setSourceId] = useState(EDITION_PRESETS['5.5e'].sourceId)
  const [sourceName, setSourceName] = useState(EDITION_PRESETS['5.5e'].sourceName)
  const [selected, setSelected] = useState<string[]>(CONTENT_TYPES.map((t) => t.value))
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  function handleEditionChange(ed: Edition) {
    setEdition(ed)
    const preset = EDITION_PRESETS[ed]
    setSourceId(preset.sourceId)
    setSourceName(preset.sourceName)
  }

  function toggle(value: string) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleStart() {
    setStarting(true)
    setError('')
    const res = await apiFetch('/api/import/open5e', {
      method: 'POST',
      body: JSON.stringify({
        sourceId,
        sourceName,
        documentKey: EDITION_PRESETS[edition].documentKey,
        edition,
        contentTypes: selected,
      }),
    })
    // Navigate to the progress view immediately on receiving jobId, per
    // Decision 1.7 — the SSE endpoint's replay-on-connect behavior smooths
    // over any race with the still-starting background import.
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
        <label className="mb-2 block text-sm font-medium">Edition</label>
        <div className="inline-flex rounded-lg border p-0.5" role="radiogroup">
          {(['5.5e', '5e'] as const).map((ed) => (
            <button
              key={ed}
              type="button"
              role="radio"
              aria-checked={edition === ed}
              onClick={() => handleEditionChange(ed)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                edition === ed
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ed === '5.5e' ? '5.5e (2024 SRD)' : '5e (2014 SRD)'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Source ID</label>
        <input value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Source Name</label>
        <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">Content Types</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CONTENT_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(t.value)} onChange={() => toggle(t.value)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleStart}
        disabled={starting || !sourceId.trim() || !sourceName.trim() || selected.length === 0}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Start Import'}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { apiFetch } from '@/api/client'
import { isElectron, selectFile } from '@/lib/electronApi'
import { Step3Progress } from './Step3Progress'

interface Step2JsonProps {
  onBack: () => void
  onDone: () => void
}

const inputClass = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function Step2Json({ onBack, onDone }: Step2JsonProps) {
  const [sourceId, setSourceId] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function handlePickFile() {
    setError('')
    try {
      const path = await selectFile([{ name: 'JSON', extensions: ['json'] }])
      if (path) setFilePath(path)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleStart() {
    if (!filePath) return
    setStarting(true)
    setError('')
    const res = await apiFetch('/api/import/file', {
      method: 'POST',
      body: JSON.stringify({ sourceId, sourceName, filePath }),
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
        <label className="mb-1 block text-sm font-medium">Source ID</label>
        <input
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder="my-homebrew-content"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Source Name</label>
        <input
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="My Homebrew Content"
          className={inputClass}
        />
      </div>
      {isElectron() ? (
        <button
          type="button"
          onClick={handlePickFile}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          {filePath ? 'Change file…' : 'Choose JSON file…'}
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
        disabled={!filePath || !sourceId.trim() || !sourceName.trim() || starting}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {starting ? 'Uploading…' : 'Upload & Import'}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

interface AwaitingConfirmationPanelProps {
  jobId: string
}

interface JobMatch {
  contentType: string
  name: string
}

interface JobDetail {
  errorLog: { matchCount?: number; matches?: JobMatch[] } | null
}

// The AWAITING_CONFIRMATION `DONE` SSE event carries no match details (just
// {type:'DONE', status}) — fetches them via GET /api/import/:jobId instead
// (added this phase specifically to close that gap).
function useImportJob(jobId: string) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async (): Promise<JobDetail> => {
      const res = await apiFetch(`/api/import/${jobId}`)
      if (!res.ok) throw new Error('Failed to load job details')
      return res.json() as Promise<JobDetail>
    },
  })
}

// Swapped in by Step3Progress whenever status === 'AWAITING_CONFIRMATION'
// (Phase 6 Decision 1.3). Resuming doesn't need to do anything beyond the
// POST — the same EventSource the parent's useImportProgress already has
// open keeps listening and picks up further events once the backend
// resumes the job, so Step3Progress swaps back on its own.
export function AwaitingConfirmationPanel({ jobId }: AwaitingConfirmationPanelProps) {
  const { data: job, isLoading } = useImportJob(jobId)
  const [resuming, setResuming] = useState(false)
  const [error, setError] = useState('')

  async function resume(decision: 'duplicate' | 'skip') {
    setResuming(true)
    setError('')
    const res = await apiFetch(`/api/import/compendium/${jobId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to resume import.')
      setResuming(false)
    }
  }

  const matches = job?.errorLog?.matches ?? []
  const matchCount = job?.errorLog?.matchCount ?? matches.length

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <h3 className="text-lg font-semibold">Duplicate content found</h3>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Loading details…'
            : `${matchCount} record${matchCount === 1 ? '' : 's'} match content that already exists.`}
        </p>
      </div>
      {matches.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-muted-foreground">
          {matches.map((m, i) => (
            <li key={i}>
              {m.contentType}: {m.name}
            </li>
          ))}
        </ul>
      )}
      {matchCount > matches.length && (
        <p className="text-xs text-muted-foreground">…and {matchCount - matches.length} more.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => resume('skip')}
          disabled={resuming}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          Skip Duplicates
        </button>
        <button
          type="button"
          onClick={() => resume('duplicate')}
          disabled={resuming}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Import as Duplicates
        </button>
      </div>
    </div>
  )
}

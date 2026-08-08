import { useEffect, useRef, useState } from 'react'

export type ImportJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AWAITING_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL'

export interface ImportProgressState {
  status: ImportJobStatus | null
  processedItems: number
  totalItems: number
  currentContentType: string | null
  errors: string[]
  isConnected: boolean
}

const TERMINAL_STATUSES = new Set<ImportJobStatus>(['COMPLETED', 'FAILED', 'PARTIAL'])

// Two shapes come over the wire (see server/src/routes/import.ts and
// importers/importEvents.ts): the replay-on-connect/job-level shape
// ({type:'STATUS', status: ImportJobStatus, processedItems, totalItems} or
// {type:'DONE', status: ImportJobStatus}), and a per-content-type progress
// shape ({type: <CONTENT_TYPE>, status: 'running'|'done'|'error', count?,
// message?}) — note `status` means something different in each: a real job
// status in the first, a per-step running/done/error tag in the second.
interface RawEvent {
  type: string
  status?: string
  processedItems?: number
  totalItems?: number
  count?: number
  message?: string
}

function isJobStatus(value: string | undefined): value is ImportJobStatus {
  return (
    value === 'PENDING' ||
    value === 'RUNNING' ||
    value === 'AWAITING_CONFIRMATION' ||
    value === 'COMPLETED' ||
    value === 'FAILED' ||
    value === 'PARTIAL'
  )
}

const INITIAL_STATE: ImportProgressState = {
  status: null,
  processedItems: 0,
  totalItems: 0,
  currentContentType: null,
  errors: [],
  isConnected: false,
}

// Owns one EventSource for the whole wizard step's lifetime (Phase 6 Decision
// 1.3). AWAITING_CONFIRMATION arrives as a `type:'DONE'` event (the backend
// uses the same completion signal for a real terminal status and for a
// Compendium job pausing) but is NOT a terminal status — the stream stays
// open, so the wizard can swap AwaitingConfirmationPanel in and back out
// without ever reconnecting once POST .../resume continues the same job.
export function useImportProgress(jobId: string | null): ImportProgressState {
  const [state, setState] = useState<ImportProgressState>(INITIAL_STATE)
  const sourceRef = useRef<EventSource | null>(null)

  // Reset during render when jobId changes (React's recommended pattern for
  // adjusting state on a prop change), not inside the effect below — calling
  // setState synchronously in an effect body triggers an extra cascading
  // render instead of folding into the render already in progress.
  const [trackedJobId, setTrackedJobId] = useState(jobId)
  if (jobId !== trackedJobId) {
    setTrackedJobId(jobId)
    setState(INITIAL_STATE)
  }

  useEffect(() => {
    if (!jobId) return

    const source = new EventSource(`/api/import/progress/${jobId}`)
    sourceRef.current = source

    source.onopen = () => setState((prev) => ({ ...prev, isConnected: true }))
    source.onerror = () => setState((prev) => ({ ...prev, isConnected: false }))

    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as RawEvent

      setState((prev) => {
        if (data.type === 'STATUS' || data.type === 'DONE') {
          return {
            ...prev,
            isConnected: true,
            status: isJobStatus(data.status) ? data.status : prev.status,
            processedItems: data.processedItems ?? prev.processedItems,
            totalItems: data.totalItems ?? prev.totalItems,
          }
        }

        // Per-content-type progress event.
        const next: ImportProgressState = { ...prev, isConnected: true }
        if (data.status === 'running') {
          next.currentContentType = data.type
        }
        if (data.status === 'done' || data.status === 'error') {
          next.processedItems = prev.processedItems + 1
        }
        if (data.status === 'error' && data.message) {
          next.errors = [...prev.errors, `${data.type}: ${data.message}`]
        }
        return next
      })

      if (data.type === 'DONE' && isJobStatus(data.status) && TERMINAL_STATUSES.has(data.status)) {
        source.close()
      }
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [jobId])

  return state
}

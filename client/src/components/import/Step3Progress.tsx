import { useImportProgress } from '@/hooks/useImportProgress'
import { AwaitingConfirmationPanel } from './AwaitingConfirmationPanel'

interface Step3ProgressProps {
  jobId: string
  onDone: () => void
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'PARTIAL'])

// Shared across all three import kinds (Open5e, Compendium, JSON) — each
// Step2 component renders this once it has a jobId. Owns the one
// useImportProgress connection for the step's lifetime and swaps in
// AwaitingConfirmationPanel in place whenever status is
// AWAITING_CONFIRMATION (Phase 6 Decision 1.3), swapping back automatically
// once a later event reports something else.
export function Step3Progress({ jobId, onDone }: Step3ProgressProps) {
  const progress = useImportProgress(jobId)

  if (progress.status === 'AWAITING_CONFIRMATION') {
    return <AwaitingConfirmationPanel jobId={jobId} />
  }

  const isTerminal = progress.status !== null && TERMINAL.has(progress.status)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Import Progress</h3>
        <p className="text-sm text-muted-foreground">
          {progress.status ?? 'Connecting…'} — {progress.processedItems} /{' '}
          {progress.totalItems || '?'}
        </p>
      </div>
      {progress.currentContentType && !isTerminal && (
        <p className="text-sm">Currently importing: {progress.currentContentType}</p>
      )}
      {progress.errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Errors</p>
          <ul className="mt-1 list-disc pl-5">
            {progress.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {isTerminal && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Done
        </button>
      )}
    </div>
  )
}

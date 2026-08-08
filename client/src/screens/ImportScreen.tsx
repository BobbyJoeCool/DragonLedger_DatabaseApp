import { useLocation, useNavigate } from 'react-router'
import { ImportWizard } from '@/components/import/ImportWizard'
import { Step3Progress } from '@/components/import/Step3Progress'

// SourceRow's "Re-import" action already has a jobId (Open5e sources have
// everything a re-import needs up front, no wizard round-trip) — arriving
// here with location.state.jobId skips straight to the progress view.
export function ImportScreen() {
  const location = useLocation()
  const navigate = useNavigate()
  const reimportJobId = (location.state as { jobId?: string } | null)?.jobId

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Import</h2>
      <p className="text-muted-foreground">
        Import content from Open5e, a Compendium file, or a JSON file.
      </p>
      {reimportJobId ? (
        <Step3Progress jobId={reimportJobId} onDone={() => navigate('/sources')} />
      ) : (
        <ImportWizard />
      )}
    </div>
  )
}

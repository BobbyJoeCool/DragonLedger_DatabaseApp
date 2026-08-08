import { useState } from 'react'
import { useNavigate } from 'react-router'
import { apiFetch } from '@/api/client'
import type { Source } from '@/hooks/useSources'
import { ClearEntriesDialog } from './ClearEntriesDialog'
import { DeleteSourceDialog } from './DeleteSourceDialog'

interface SourceRowProps {
  source: Source
  isSignedIn: boolean
}

// Every Open5e-imported source already carries what a re-import needs
// (sourceId, sourceName) — no wizard round-trip required, unlike Compendium/
// JSON sources, which need a filesystem path the app never stores (Phase 6
// Decision 1.6, hence no re-import action for those two source types here).
const OPEN5E_CONTENT_TYPES = ['CONDITION', 'SPELL', 'RACE', 'CLASS', 'BACKGROUND', 'ITEM', 'MONSTER']

export function SourceRow({ source, isSignedIn }: SourceRowProps) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'delete' | 'clear' | null>(null)
  const [reimporting, setReimporting] = useState(false)

  async function handleReimport() {
    setReimporting(true)
    const res = await apiFetch('/api/import/open5e', {
      method: 'POST',
      body: JSON.stringify({
        sourceId: source.id,
        sourceName: source.name,
        contentTypes: OPEN5E_CONTENT_TYPES,
      }),
    })
    setReimporting(false)
    if (res.status === 202) {
      const { jobId } = await res.json()
      navigate('/sources/import', { state: { jobId } })
    }
  }

  return (
    <>
      <tr className="border-b">
        <td className="px-3 py-2">
          <span title={source.name} className="block max-w-xs truncate">
            {source.name}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className="rounded-full border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {source.type}
          </span>
        </td>
        <td className="px-3 py-2 text-right">{source.entryCount}</td>
        <td className="px-3 py-2 text-muted-foreground">
          {new Date(source.lastUpdated).toLocaleString()}
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-2">
            {source.type === 'API' && (
              <button
                type="button"
                onClick={handleReimport}
                disabled={!isSignedIn || reimporting}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {reimporting ? 'Starting…' : 'Re-import'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDialog('clear')}
              disabled={!isSignedIn}
              className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              Clear entries
            </button>
            <button
              type="button"
              onClick={() => setDialog('delete')}
              disabled={!isSignedIn || !source.isDeletable}
              title={!source.isDeletable ? 'This source is protected' : undefined}
              className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
      {dialog === 'delete' && <DeleteSourceDialog source={source} onClose={() => setDialog(null)} />}
      {dialog === 'clear' && <ClearEntriesDialog source={source} onClose={() => setDialog(null)} />}
    </>
  )
}

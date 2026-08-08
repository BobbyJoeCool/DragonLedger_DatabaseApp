import { useState } from 'react'
import { Link } from 'react-router'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import { SourcesTable } from '@/components/sources/SourcesTable'
import { useSources } from '@/hooks/useSources'

export function SourcesScreen() {
  const { data: sources, isLoading, isError } = useSources()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Sources</h2>
          <p className="mt-1 text-muted-foreground">Manage content sources.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/sources/import"
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            Import Content
          </Link>
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            disabled={!isSignedIn}
            title={isSignedIn ? undefined : 'Sign in to add a source'}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Add Source
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load sources.</p>}
      {sources && (
        <div className="overflow-x-auto rounded-md border">
          <SourcesTable sources={sources} isSignedIn={isSignedIn} />
        </div>
      )}

      {showAddDialog && <AddSourceDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  )
}

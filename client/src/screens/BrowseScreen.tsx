import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { ResultsTable } from '@/components/browse/ResultsTable'
import { BulkActionBar } from '@/components/browse/BulkActionBar'
import { DetailPopup } from '@/components/browse/DetailPopup'
import { PrintCardsOverlay } from '@/components/browse/PrintCardsOverlay'
import { PrintTradingCardsButton } from '@/components/cards/tradingCards/PrintTradingCardsButton'
import { Modal } from '@/components/ui/Modal'
import { defaultFilters, allFieldsParams, apiPath, type ContentFilters } from '@/lib/contentQuery'
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, CONTENT_TYPE_SINGULAR, type ContentType } from '@/lib/contentTypes'
import { FILTER_BARS } from '@/lib/filterBarRegistry'
import { useDisplaySelection } from '@/hooks/useDisplaySelection'
import type { DependentEntry } from './browseTypes'

type BrowseState = Record<ContentType, ContentFilters>

function initialBrowseState(): BrowseState {
  const state = {} as BrowseState
  for (const type of CONTENT_TYPES) state[type] = defaultFilters()
  return state
}

type BulkDeleteState =
  | { step: 'idle' }
  | { step: 'confirming'; dependents: { willDelete: DependentEntry[]; willOrphan: DependentEntry[] } | null }
  | { step: 'deleting' }

export function BrowseScreen() {
  const [activeType, setActiveType] = useState<ContentType>('spells')
  const [browseState, setBrowseState] = useState<BrowseState>(initialBrowseState)
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))
  const queryClient = useQueryClient()
  const selection = useDisplaySelection(activeType)

  const FilterBar = FILTER_BARS[activeType]
  const filters = browseState[activeType]

  const [bulkDeleteState, setBulkDeleteState] = useState<BulkDeleteState>({ step: 'idle' })
  const [printFullCards, setPrintFullCards] = useState<Record<string, unknown>[] | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  function updateFilters(next: ContentFilters) {
    setBrowseState((prev) => ({ ...prev, [activeType]: next }))
  }

  async function handleBulkDelete() {
    const ids = [...selection.selectedIds]
    const res = await apiFetch('/api/content/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ type: activeType, ids }),
    })
    if (res.status === 409) {
      const body = await res.json()
      setBulkDeleteState({ step: 'confirming', dependents: body.error.dependents })
    } else {
      setBulkDeleteState({ step: 'confirming', dependents: null })
    }
  }

  async function confirmBulkDelete() {
    setBulkDeleteState({ step: 'deleting' })
    const ids = [...selection.selectedIds]
    const res = await apiFetch('/api/content/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ type: activeType, ids, confirm: true }),
    })
    if (res.ok) {
      selection.clearAll()
      await queryClient.invalidateQueries({ queryKey: ['content-list'] })
      await queryClient.invalidateQueries({ queryKey: ['content-name-index'] })
    }
    setBulkDeleteState({ step: 'idle' })
  }

  async function handleBulkExport() {
    const params = allFieldsParams(filters)
    const res = await apiFetch(`${apiPath(activeType)}?${params.toString()}`)
    if (!res.ok) return

    const allRows = (await res.json()) as Record<string, unknown>[]
    const selected = allRows.filter((row) => selection.selectedIds.has(row.id as string))

    const singularType = CONTENT_TYPE_SINGULAR[activeType].toLowerCase()
    const exportData = {
      contentType: singularType,
      entries: selected.map(({ id: _id, ...rest }) => rest),
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dragonledger-${activeType}-export.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleBulkPrint() {
    const params = allFieldsParams(filters)
    const res = await apiFetch(`${apiPath(activeType)}?${params.toString()}`)
    if (!res.ok) return

    const allRows = (await res.json()) as Record<string, unknown>[]
    const selected = allRows.filter((row) => selection.selectedIds.has(row.id as string))
    setPrintFullCards(selected)
  }

  return (
    <div className="flex gap-6">
      <nav className="flex w-40 shrink-0 flex-col gap-1">
        {CONTENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={`rounded px-3 py-2 text-left text-sm transition-colors ${
              type === activeType
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
          >
            {CONTENT_TYPE_LABELS[type]}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{CONTENT_TYPE_LABELS[activeType]}</h2>
            <p className="mt-1 text-muted-foreground">Search and filter content.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {(activeType === 'spells' || activeType === 'items') && (
              <PrintTradingCardsButton type={activeType} filters={filters} label={CONTENT_TYPE_LABELS[activeType]} />
            )}
            {isSignedIn && (
              <Link
                to={`/browse/${activeType}/new`}
                className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                + New {CONTENT_TYPE_SINGULAR[activeType]}
              </Link>
            )}
          </div>
        </div>
        <FilterBar filters={filters} onChange={updateFilters} />
        <ResultsTable type={activeType} filters={filters} selection={selection} onItemClick={setDetailId} />
        <BulkActionBar
          selection={selection}
          isSignedIn={isSignedIn}
          onDelete={handleBulkDelete}
          onExport={handleBulkExport}
          onPrint={handleBulkPrint}
        />
      </div>

      {bulkDeleteState.step !== 'idle' && (
        <Modal
          title={`Delete ${selection.count} ${CONTENT_TYPE_LABELS[activeType].toLowerCase()}?`}
          onClose={() => setBulkDeleteState({ step: 'idle' })}
        >
          {bulkDeleteState.step === 'confirming' && bulkDeleteState.dependents && (
            <div className="space-y-2 text-sm">
              {bulkDeleteState.dependents.willDelete.length > 0 && (
                <p>
                  <span className="font-medium">Also deleted</span> (official, replaceable):{' '}
                  {bulkDeleteState.dependents.willDelete.map((d) => d.name).join(', ')}
                </p>
              )}
              {bulkDeleteState.dependents.willOrphan.length > 0 && (
                <p>
                  <span className="font-medium">Orphaned, not deleted</span> (homebrew):{' '}
                  {bulkDeleteState.dependents.willOrphan.map((d) => d.name).join(', ')}
                </p>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBulkDeleteState({ step: 'idle' })}
              disabled={bulkDeleteState.step === 'deleting'}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmBulkDelete}
              disabled={bulkDeleteState.step === 'deleting'}
              className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
            >
              {bulkDeleteState.step === 'deleting' ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </div>
        </Modal>
      )}

      {detailId && (
        <DetailPopup type={activeType} id={detailId} onClose={() => setDetailId(null)} />
      )}

      {printFullCards && (
        <PrintCardsOverlay
          type={activeType}
          entries={printFullCards}
          onClose={() => setPrintFullCards(null)}
        />
      )}
    </div>
  )
}

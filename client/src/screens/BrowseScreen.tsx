import { useState } from 'react'
import { Link } from 'react-router'
import { ResultsTable } from '@/components/browse/ResultsTable'
import { defaultFilters, type ContentFilters } from '@/lib/contentQuery'
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, CONTENT_TYPE_SINGULAR, type ContentType } from '@/lib/contentTypes'
import { FILTER_BARS } from '@/lib/filterBarRegistry'
import { PrintTradingCardsButton } from '@/components/cards/tradingCards/PrintTradingCardsButton'

type BrowseState = Record<ContentType, ContentFilters>

function initialBrowseState(): BrowseState {
  const state = {} as BrowseState
  for (const type of CONTENT_TYPES) state[type] = defaultFilters()
  return state
}

// Each content type's filter/search state persists independently for the
// session (Decision 1.4) — one state object keyed by type, not a single flat
// filter state, so switching Monsters → Spells → Monsters leaves Monster's
// filters exactly as they were.
export function BrowseScreen() {
  const [activeType, setActiveType] = useState<ContentType>('spells')
  const [browseState, setBrowseState] = useState<BrowseState>(initialBrowseState)
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  const FilterBar = FILTER_BARS[activeType]
  const filters = browseState[activeType]

  function updateFilters(next: ContentFilters) {
    setBrowseState((prev) => ({ ...prev, [activeType]: next }))
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
        <ResultsTable type={activeType} filters={filters} />
      </div>
    </div>
  )
}

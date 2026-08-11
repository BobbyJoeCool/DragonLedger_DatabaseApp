import { useState } from 'react'
import type { Item, Spell } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { allFieldsParams, apiPath, type ContentFilters } from '@/lib/contentQuery'
import { TradingCardSheet } from './TradingCardSheet'
import { itemToCardSource, spellToCardSource } from './adapters'
import type { CardSource } from './buildTradingCards'

export type TradingCardType = 'spells' | 'items'

interface PrintTradingCardsButtonProps {
  type: TradingCardType
  filters: ContentFilters
  label: string
}

/**
 * Bulk print action for Browse — builds a trading-card sheet from
 * whatever the current filters match (fetched fresh via `?fields=all`,
 * unpaginated), not just whatever's scrolled into view in the results
 * table. Only Spell/Item have a trading-card render target (§3 of the
 * handoff doc).
 */
export function PrintTradingCardsButton({ type, filters, label }: PrintTradingCardsButtonProps) {
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<CardSource[] | null>(null)

  async function handleClick() {
    setLoading(true)
    try {
      const params = allFieldsParams(filters)
      const res = await apiFetch(`${apiPath(type)}?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load ${type} for printing`)
      const rows = (await res.json()) as (Spell | Item)[] & { id: string }[]
      const built =
        type === 'spells'
          ? (rows as (Spell & { id: string })[]).map(spellToCardSource)
          : (rows as (Item & { id: string })[]).map(itemToCardSource)
      setSources(built)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Print as Trading Cards'}
      </button>
      {sources && <TradingCardSheet label={label} sources={sources} onClose={() => setSources(null)} />}
    </>
  )
}

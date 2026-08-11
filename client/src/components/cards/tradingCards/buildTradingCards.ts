import type { ReactNode } from 'react'
import {
  TRADING_CARD_CHAR_BUDGET,
  buildSegments,
  parseDescriptionBlocks,
  type DescriptionBlock,
} from '@/components/cards/shared'

export interface CardSource {
  id: string
  title: string
  meta: string
  description: string
  higherLevels?: string
  footer?: ReactNode
}

export interface TradingCardData {
  cardId: string
  title: string
  meta: string
  continuation: boolean
  blocks: DescriptionBlock[]
  footer?: ReactNode
}

/**
 * One entry (Spell/Item) -> one or more physical trading cards. Never
 * shrinks text to fit (§5 decision log) — greedy pagination via the
 * shared buildSegments utility spills overflow onto "(cont.)" cards
 * instead. The footer (damage/save/area for a Spell, weapon/armor stats
 * for an Item) repeats on every card in the spread, not just the first —
 * a lone continuation card should still be independently useful.
 */
export function buildTradingCardsForEntry(source: CardSource): TradingCardData[] {
  const blocks = parseDescriptionBlocks(source.description)
  const segments = buildSegments(blocks, TRADING_CARD_CHAR_BUDGET, {
    higherLevels: source.higherLevels ? { heading: 'At Higher Levels.', text: source.higherLevels } : undefined,
  })

  const cardBlocks = segments.length > 0 ? segments : [[]]

  return cardBlocks.map((segmentBlocks, i) => ({
    cardId: `${source.id}-${i}`,
    title: source.title,
    meta: source.meta,
    continuation: i > 0,
    blocks: segmentBlocks,
    footer: source.footer,
  }))
}

export function buildTradingCards(sources: CardSource[]): TradingCardData[] {
  return sources.flatMap(buildTradingCardsForEntry)
}

export function chunkIntoSheets<T>(items: T[], perSheet: number): T[][] {
  const sheets: T[][] = []
  for (let i = 0; i < items.length; i += perSheet) {
    sheets.push(items.slice(i, i + perSheet))
  }
  return sheets.length > 0 ? sheets : [[]]
}

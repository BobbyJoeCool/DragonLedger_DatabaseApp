import { useMemo, useState } from 'react'
import { CardThemeProvider, TRADING_CARDS_PER_SHEET, type CardThemeName } from '@/components/cards/shared'
import { ThemeSelect } from '@/components/cards/ThemeSelect'
import { TradingCard } from './TradingCard'
import { buildTradingCards, chunkIntoSheets, type CardSource } from './buildTradingCards'

export interface TradingCardSheetProps {
  label: string
  sources: CardSource[]
  onClose: () => void
}

/**
 * Full-screen overlay printing a batch of entries as a trading-card sheet
 * — real 2.5x3.5in cards, 3x3 grid per Letter page, dashed cut guides.
 * Triggered as a bulk action from Browse (not a single-entry view): the
 * `sources` array is whatever the caller's current filters matched.
 */
export function TradingCardSheet({ label, sources, onClose }: TradingCardSheetProps) {
  const [theme, setTheme] = useState<CardThemeName>('parchment')
  const cards = useMemo(() => buildTradingCards(sources), [sources])
  const sheets = useMemo(() => chunkIntoSheets(cards, TRADING_CARDS_PER_SHEET), [cards])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background p-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">Trading Cards — {label}</h2>
          <p className="text-sm text-muted-foreground">
            {sources.length} {sources.length === 1 ? 'entry' : 'entries'}, {cards.length}{' '}
            {cards.length === 1 ? 'card' : 'cards'} across {sheets.length} sheet
            {sheets.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSelect value={theme} onChange={setTheme} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Print
          </button>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Close
          </button>
        </div>
      </div>

      <CardThemeProvider theme={theme}>
        <div className="space-y-6 p-6 print:space-y-0 print:p-0">
          {sheets.map((sheetCards, i) => (
            <div className="dl-tc-sheet" key={i}>
              {sheetCards.map((card) => (
                <TradingCard key={card.cardId} {...card} />
              ))}
            </div>
          ))}
        </div>
      </CardThemeProvider>
    </div>
  )
}

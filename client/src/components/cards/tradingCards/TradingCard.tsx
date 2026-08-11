import { Divider } from '@/components/cards/shared'
import type { TradingCardData } from './buildTradingCards'

/**
 * A single 2.5in x 3.5in physical card — §3/§5. Footer height is reserved
 * below the scrollable-in-theory-but-never-actually-overflowing body (the
 * greedy pagination in buildTradingCardsForEntry already fit the text to
 * TRADING_CARD_CHAR_BUDGET), so the footer never spills.
 */
export function TradingCard({ title, meta, continuation, blocks, footer }: TradingCardData) {
  return (
    <div className="dl-tc-card">
      <div className="dl-tc-header">
        <p className="dl-tc-title">
          {title}
          {continuation ? <span className="dl-tc-cont"> (cont.)</span> : null}
        </p>
        {meta && <p className="dl-tc-meta">{meta}</p>}
      </div>
      <Divider variant="minor" />
      <div className="dl-tc-body">
        {blocks.map((block, i) =>
          block.type === 'paragraph' ? (
            <p key={i}>{block.text}</p>
          ) : block.ordered ? (
            <ol key={i} start={block.start}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ol>
          ) : (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          ),
        )}
      </div>
      {footer && <div className="dl-tc-footer">{footer}</div>}
    </div>
  )
}

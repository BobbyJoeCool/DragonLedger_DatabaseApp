import type { ReactNode } from 'react'

export interface SubcardProps {
  tabLabel: string
  children: ReactNode
  className?: string
}

/**
 * Bordered, corner-tabbed mini-card — §1.4. The same visual pattern reused
 * verbatim across Race->Subrace (Expanded mode), Class/Subclass (Expanded
 * mode, one per grouped feature), and the Monster+Spellcasting packet (one
 * per spell). Only the tab label and content change per call site.
 *
 * The tab's negative top offset needs real vertical clearance above it —
 * this bit a real production bug during the demo phase (a preceding
 * element's margin-bottom didn't leave enough room and the tab visually
 * collided with it). Fixed here as part of the component's own layout
 * contract (margin-top on `.dl-subcard` itself, see index.css) rather than
 * something every call site has to remember to add.
 */
export function Subcard({ tabLabel, children, className }: SubcardProps) {
  return (
    <div className={'dl-subcard' + (className ? ` ${className}` : '')}>
      <span className="dl-subcard-tab">{tabLabel}</span>
      <div className="dl-subcard-body">{children}</div>
    </div>
  )
}

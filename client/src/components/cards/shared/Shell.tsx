import type { CSSProperties, ReactNode } from 'react'

export type ShellMode = 'page' | 'document'

export interface ShellProps {
  /**
   * `page` — a single capped Letter-sized sheet (Monster list view,
   * Class/Race list view, simple cards). `document` — an uncapped flowing
   * container, used when content is explicitly allowed to spill across
   * multiple pages (Race/Class Expanded mode, the Monster+Spellcasting
   * packet). Print CSS still paginates a `document` via `break-inside` on
   * individual blocks; there is no artificial height cap on the container
   * itself, unlike `page`.
   */
  mode: ShellMode
  children: ReactNode
  className?: string
  /** Applied to the inner `.dl-frame` — e.g. a fit-to-page transform/width from useFitToPage. */
  frameStyle?: CSSProperties
  frameClassName?: string
}

/**
 * Shell / Page — §1.1. `.frame` is the bordered card box inside either
 * target: 2.5px solid border, 1px outline offset 4px (the "double rule"
 * book-page look), overflow hidden, break-inside/page-break-inside avoid.
 */
export function Shell({ mode, children, className, frameStyle, frameClassName }: ShellProps) {
  const outerClass = mode === 'page' ? 'dl-shell-page' : 'dl-shell-document'

  return (
    <div className={outerClass + (className ? ` ${className}` : '')}>
      <div
        className={'dl-frame' + (frameClassName ? ` ${frameClassName}` : '')}
        style={frameStyle}
      >
        {children}
      </div>
    </div>
  )
}

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { FIT_SCALE_FLOOR, HALF_WIDTH_FRACTION, PAGE_INNER_MAX } from './constants'

export type FitToPageMode = 'monster' | 'document'
export type CardWidth = 'half' | 'full'
export type WidthOverride = CardWidth | 'auto'

export interface FitToPageResult {
  width: CardWidth
  scale: number
  /** document mode only — how many physical pages the flowing fallback targets. */
  pages: number
}

/**
 * Pure tier-decision core of useFitToPage (§1.5) — kept separate from the
 * DOM-measuring hook below so the actual threshold logic is unit-testable
 * without a real browser layout.
 *
 * `monster` mode — 3-tier width + scale decision:
 *   1. half-width single column, if it fits under PAGE_INNER_MAX * 0.55
 *   2. else full-width two-column, if it fits under PAGE_INNER_MAX
 *   3. else full-width, scaled down (floor 0.55) — accepted to render
 *      slightly taller than one physical page rather than clip data
 *
 * `document` mode — 2-tier decision (Class/Race list views):
 *   1. natural size on one page
 *   2. scale to fit one page, must be >= the 0.55 floor
 *   3. else fall back to a flowing multi-page document, adding pages until
 *      the resulting scale clears the floor (the demos hardcoded a 2-page
 *      target; this keeps adding pages instead of assuming 2 is enough)
 */
export function decideFit(
  mode: FitToPageMode,
  heights: { half?: number; full: number },
  widthOverride: WidthOverride = 'auto',
): FitToPageResult {
  if (mode === 'monster') {
    if (widthOverride !== 'full' && heights.half !== undefined) {
      if (heights.half <= PAGE_INNER_MAX * HALF_WIDTH_FRACTION) {
        return { width: 'half', scale: 1, pages: 1 }
      }
      if (widthOverride === 'half') {
        return { width: 'half', scale: Math.max(PAGE_INNER_MAX / heights.half, FIT_SCALE_FLOOR), pages: 1 }
      }
    }
    if (heights.full <= PAGE_INNER_MAX) {
      return { width: 'full', scale: 1, pages: 1 }
    }
    return { width: 'full', scale: Math.max(PAGE_INNER_MAX / heights.full, FIT_SCALE_FLOOR), pages: 1 }
  }

  // document mode
  const naturalH = heights.full
  if (naturalH <= PAGE_INNER_MAX) {
    return { width: 'full', scale: 1, pages: 1 }
  }
  const oneScaledPage = PAGE_INNER_MAX / naturalH
  if (oneScaledPage >= FIT_SCALE_FLOOR) {
    return { width: 'full', scale: oneScaledPage, pages: 1 }
  }
  let pages = 2
  let scale = Math.max((PAGE_INNER_MAX * pages) / naturalH, FIT_SCALE_FLOOR)
  while ((PAGE_INNER_MAX * pages) / naturalH < FIT_SCALE_FLOOR) {
    pages += 1
    scale = Math.max((PAGE_INNER_MAX * pages) / naturalH, FIT_SCALE_FLOOR)
  }
  return { width: 'full', scale, pages }
}

type Phase = 'measuring-half' | 'measuring-full' | 'settled'

/**
 * DOM-measuring wrapper around decideFit. Give it a ref to the card's
 * measurable content; it renders through the width tiers (applying
 * `widthClassName` to whatever the caller attaches it to), re-measuring
 * `scrollHeight` after each layout via ResizeObserver, until decideFit
 * settles on a result.
 *
 * `document` mode never needs a half-width attempt, so it measures once at
 * natural width and resolves immediately.
 */
export function useFitToPage(
  contentRef: RefObject<HTMLElement | null>,
  mode: FitToPageMode,
  widthOverride: WidthOverride = 'auto',
): FitToPageResult & { widthClassName: string; settled: boolean } {
  const [phase, setPhase] = useState<Phase>(
    mode === 'document' || widthOverride === 'full' ? 'measuring-full' : 'measuring-half',
  )
  const [result, setResult] = useState<FitToPageResult>({ width: 'full', scale: 1, pages: 1 })
  const halfHeightRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const measure = () => {
      const height = el.scrollHeight

      if (phase === 'measuring-half') {
        halfHeightRef.current = height
        const attempt = decideFit(mode, { half: height, full: height }, widthOverride)
        if (attempt.width === 'half' && attempt.scale === 1) {
          setResult(attempt)
          setPhase('settled')
        } else {
          setPhase('measuring-full')
        }
        return
      }

      if (phase === 'measuring-full') {
        const final = decideFit(mode, { half: halfHeightRef.current, full: height }, widthOverride)
        setResult(final)
        setPhase('settled')
      }
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, widthOverride])

  const widthClassName =
    phase === 'measuring-half' ? 'dl-fit-half' : result.width === 'half' ? 'dl-fit-half' : 'dl-fit-full'

  return { ...result, widthClassName, settled: phase === 'settled' }
}

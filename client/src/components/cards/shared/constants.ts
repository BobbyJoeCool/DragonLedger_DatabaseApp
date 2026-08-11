// Print target is US Letter (8.5in x 11in) at the standard 96 CSS px/in.
// See Documentation/phase-8-card-theming-final-export.md §1.1 — the demo
// files each recomputed this slightly differently (~14px frame padding +
// a few px safety margin); standardized here as the one real constant.
const LETTER_HEIGHT_IN = 11
const PAGE_MARGIN_IN = 0.5
const CSS_PX_PER_IN = 96
const FRAME_PADDING_PX = 14
const SAFETY_MARGIN_PX = 8

export const PAGE_INNER_MAX =
  LETTER_HEIGHT_IN * CSS_PX_PER_IN -
  2 * (PAGE_MARGIN_IN * CSS_PX_PER_IN) -
  2 * FRAME_PADDING_PX -
  SAFETY_MARGIN_PX

// Shared floor for every fit-to-page scale decision (§1.5) — a card is
// never shrunk smaller than this; below it, layout falls through to the
// next tier (a taller/multi-page render) instead of becoming illegible.
export const FIT_SCALE_FLOOR = 0.55

// A half-width card must leave room for a second half-width card on the
// same physical page, not just fit under the full-page cap on its own.
export const HALF_WIDTH_FRACTION = 0.55

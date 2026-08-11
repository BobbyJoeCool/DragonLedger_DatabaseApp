// Shared Tailwind class strings for card content, mirroring the pattern
// already established by client/src/components/forms/widgets/styles.ts —
// plain exported class-string constants, not a component-abstraction
// layer. Each per-type card still owns its own markup.
//
// These specifically capture patterns that were independently duplicated
// across all 6 Phase 7 card components (SpellCard, MonsterCard, ClassCard,
// RaceCard, SubclassCard, SubraceCard) — the same `dl` grid, the same
// muted-label/value pairing, the same "Additional Details" trailing block
// — so the Phase 8 per-type rebuild has one place to pull them from
// instead of re-copying the strings an eighth, ninth, and tenth time.

// `dl-muted`/`dl-accent` (defined in index.css) follow the active card
// theme's tokens (--card-muted/--card-accent), unlike the app-wide
// `text-muted-foreground` these replace — a themed card's "muted" text
// should follow its own palette, not the surrounding app chrome's.
export const cardHeading = 'text-2xl font-semibold dl-font-display'
export const subheading = 'italic dl-muted'
export const detailGrid = 'grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm'
export const detailRow = 'contents'
export const detailLabel = 'dl-muted'
export const sectionLabel = 'font-medium text-sm'
// Sub-item bolded headings within a list (feature/trait/action/benefit
// names) — decision log: "List-line bolded headings use color:var(--accent),
// not the default ink color."
export const entryName = 'font-medium dl-accent'
export const proseSection = 'space-y-2 text-sm leading-relaxed'
// No border-t/pt-3 here — a Divider element is placed before this block
// instead, consistent with the doc's "one minor divider per boundary" rule.
export const additionalDetailsWrap = 'space-y-1 text-sm'

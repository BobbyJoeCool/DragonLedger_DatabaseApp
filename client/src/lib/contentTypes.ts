// The 8 top-level browsable content types (outline.md §5.2). Subclass/Subrace
// are reached from a Class/Race's detail view, not top-level browsed.
// ContentClassOption is Class-detail-only too (Phase 5 design decision —
// most live rows aren't linked to a class yet, so a bare top-level list
// wouldn't be very useful on its own).
export const CONTENT_TYPES = [
  'spells',
  'classes',
  'races',
  'backgrounds',
  'conditions',
  'items',
  'monsters',
  'feats',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value)
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  spells: 'Spells',
  classes: 'Classes',
  races: 'Races',
  backgrounds: 'Backgrounds',
  conditions: 'Conditions',
  items: 'Items',
  monsters: 'Monsters',
  feats: 'Feats',
}

// Singular display label, e.g. for Breadcrumb ("Browse → Spell → Fireball").
export const CONTENT_TYPE_SINGULAR: Record<ContentType, string> = {
  spells: 'Spell',
  classes: 'Class',
  races: 'Race',
  backgrounds: 'Background',
  conditions: 'Condition',
  items: 'Item',
  monsters: 'Monster',
  feats: 'Feat',
}

// API mount path per type — matches server/src/app.ts's `app.use('/api/<x>', ...)`.
export const CONTENT_TYPE_API_PATH: Record<ContentType, string> = {
  spells: '/api/spells',
  classes: '/api/classes',
  races: '/api/races',
  backgrounds: '/api/backgrounds',
  conditions: '/api/conditions',
  items: '/api/items',
  monsters: '/api/monsters',
  feats: '/api/feats',
}

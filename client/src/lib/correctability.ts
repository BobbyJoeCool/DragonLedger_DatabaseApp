import type { Source } from '@/hooks/useSources'

// Mirrors the backend rule (phase-4-write-api-final-export.md §4,
// server/src/routes/content/writeHandlers.ts's createPatchHandler +
// each schema's `<Type>CorrectableSchema`) so SaveButton can decide its
// label/behavior live as the user types, without a round-trip. Keep this
// lock list in sync with the schemas in packages/content-types/src if a
// future type's fields change.
export type WritableContentType =
  | 'spells'
  | 'classes'
  | 'subclasses'
  | 'races'
  | 'subraces'
  | 'backgrounds'
  | 'conditions'
  | 'items'
  | 'monsters'
  | 'feats'
  | 'classOptions'

const LOCK_FIELDS: Record<WritableContentType, string[]> = {
  spells: ['name', 'slug', 'sourceId'],
  classes: ['name', 'slug', 'sourceId'],
  subclasses: ['name', 'slug', 'sourceId', 'classId'],
  races: ['name', 'slug', 'sourceId'],
  subraces: ['name', 'slug', 'sourceId', 'raceId'],
  backgrounds: ['name', 'slug', 'sourceId'],
  conditions: ['name', 'slug', 'sourceId'],
  items: ['name', 'slug', 'sourceId'],
  monsters: ['name', 'slug', 'sourceId'],
  feats: ['name', 'slug', 'sourceId'],
  classOptions: ['name', 'slug', 'sourceId', 'classId'],
}

export function isFieldCorrectable(
  type: WritableContentType,
  sourceType: Source['type'],
  field: string,
): boolean {
  if (sourceType === 'MANUAL') return true
  if (sourceType === 'API') return false
  return !LOCK_FIELDS[type].includes(field)
}

// A whole edit only stays on the in-place "Save" path while every dirty
// field is individually correctable — one locked field flips the whole
// submission to "Save as...", per Phase 7 §1.4.
export function isEditCorrectable(
  type: WritableContentType,
  sourceType: Source['type'],
  dirtyFields: string[],
): boolean {
  return dirtyFields.every((field) => isFieldCorrectable(type, sourceType, field))
}

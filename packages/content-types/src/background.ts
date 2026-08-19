import { z } from 'zod'
import { abilityBonusGrantSchema, grantChoiceSchema } from './shared.js'

const proficiencyEntrySchema = z.object({
  name: z.string(),
  category: z.enum(['skill', 'tool']),
})

export const proficienciesGrantSchema = z.object({
  fixed: z.array(proficiencyEntrySchema),
  choices: z.array(
    grantChoiceSchema.and(
      z.object({ from: z.array(proficiencyEntrySchema).nullable().optional() }).partial(),
    ),
  ),
})

const featureSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
})

export const BackgroundSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  edition: z.enum(["5e", "5.5e"]).optional(),
  proficiencies: proficienciesGrantSchema,
  abilityBonuses: abilityBonusGrantSchema,
  feature: z.array(featureSchema),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const BackgroundPartialSchema = BackgroundSchema.partial()

// Correctable subset: source-type-based, not a per-field curated list (see
// phase-4-write-api-final-export.md §4). Every field is correctable except
// the fixed lock list (name/slug/sourceId) — whether this schema actually
// applies to a given row depends on that row's Source.type, decided in
// writeHandlers.ts, not here.
export const BackgroundCorrectableSchema = BackgroundSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export type Background = z.infer<typeof BackgroundSchema>

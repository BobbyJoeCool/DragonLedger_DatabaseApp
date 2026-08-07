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
  proficiencies: proficienciesGrantSchema,
  abilityBonuses: abilityBonusGrantSchema,
  feature: z.array(featureSchema),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const BackgroundPartialSchema = BackgroundSchema.partial()

// Correctable subset: proficiencies/abilityBonuses are parsed from free
// prose bullet points ("Choose one kind of Gaming Set") into the Fixed/Choice
// Grant Shape — a real, known gap area (extraData.proficiencyMismatch exists
// for exactly this reason). feature[] is mostly empty on 2024-style
// backgrounds and, when populated, is a direct {name,description} copy, not
// an inference.
export const BackgroundCorrectableSchema = BackgroundSchema.pick({
  proficiencies: true,
  abilityBonuses: true,
}).strict()

export type Background = z.infer<typeof BackgroundSchema>

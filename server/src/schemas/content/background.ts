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

export type Background = z.infer<typeof BackgroundSchema>

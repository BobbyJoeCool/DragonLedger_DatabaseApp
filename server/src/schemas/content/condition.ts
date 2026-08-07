import { z } from 'zod'

export const ConditionSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  effects: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ConditionPartialSchema = ConditionSchema.partial()

// Correctable subset: nothing at the top level qualifies. The one real
// parser-inferred fact about a Condition row — whether extraData.descriptionSource
// used a fallback substitution — lives inside extraData, deferred per Spell's
// same reasoning; description/effects are direct source copies.
export const ConditionCorrectableSchema = ConditionSchema.pick({}).strict()

export type Condition = z.infer<typeof ConditionSchema>

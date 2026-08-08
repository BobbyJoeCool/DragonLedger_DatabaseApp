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

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the fixed lock list (name/slug/
// sourceId) — a real change from the old rule, which had this at zero.
export const ConditionCorrectableSchema = ConditionSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export type Condition = z.infer<typeof ConditionSchema>

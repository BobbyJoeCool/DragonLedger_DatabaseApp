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

export type Condition = z.infer<typeof ConditionSchema>

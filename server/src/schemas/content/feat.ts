import { z } from 'zod'

export const FeatSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  prerequisite: z.string().nullable().optional(),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const FeatPartialSchema = FeatSchema.partial()

export type Feat = z.infer<typeof FeatSchema>

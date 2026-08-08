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

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the fixed lock list (name/slug/
// sourceId).
export const FeatCorrectableSchema = FeatSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export type Feat = z.infer<typeof FeatSchema>

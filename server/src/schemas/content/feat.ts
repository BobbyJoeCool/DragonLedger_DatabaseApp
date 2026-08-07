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

// Correctable subset: category is inferred from a name-prefix scan
// (unprefixed → GENERAL default; real prefixes go well beyond the
// originally-documented set — Dragonmark, Path of the Lich, etc.), a
// genuine parser judgment call. prerequisite is a direct text copy when
// present; description is raw prose.
export const FeatCorrectableSchema = FeatSchema.pick({
  category: true,
}).strict()

export type Feat = z.infer<typeof FeatSchema>

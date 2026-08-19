import { z } from 'zod'

export const ClassOptionSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  classId: z.string().nullable().optional(),
  // Real Compendium data has more pool types than the three the design doc
  // named — "Arcane Shot", "Channeling", "Psionic Discipline" all showed up
  // live, matching its own "| future pools" hedge. A free string, not a
  // closed enum.
  pool: z.string().min(1),
  name: z.string().min(1),
  edition: z.enum(["5e", "5.5e"]).optional(),
  description: z.string(),
  prerequisite: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ClassOptionPartialSchema = ClassOptionSchema.partial()

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4), applied for consistency with Subclass/Subrace even though
// ClassOption has no standalone form (it's edited inline within ClassForm,
// §0.1). Every field is correctable except the lock list — name/slug/
// sourceId plus classId, the parent-relation FK.
export const ClassOptionCorrectableSchema = ClassOptionSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
  classId: true,
}).partial().strict()

export type ClassOption = z.infer<typeof ClassOptionSchema>

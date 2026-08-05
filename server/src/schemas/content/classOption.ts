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
  description: z.string(),
  prerequisite: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ClassOptionPartialSchema = ClassOptionSchema.partial()

export type ClassOption = z.infer<typeof ClassOptionSchema>

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

// Correctable subset: classId is the same cross-source-resolution-style
// field as Subclass.classId/Subrace.raceId — currently null on all 126 live
// rows (no importer has resolved it yet), but the same "parser inference,
// not a rules edit" logic applies once it is populated. pool is a direct
// copy of the source's Options-suffix distinction (Maneuver, Metamagic,
// etc.), not an inference.
export const ClassOptionCorrectableSchema = ClassOptionSchema.pick({
  classId: true,
}).strict()

export type ClassOption = z.infer<typeof ClassOptionSchema>

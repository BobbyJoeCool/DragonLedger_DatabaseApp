import { z } from 'zod'

export const SpellSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.string().min(1),
  castingTime: z.string(),
  range: z.string(),
  components: z.string(),
  material: z.string().nullable().optional(),
  duration: z.string(),
  concentration: z.boolean(),
  ritual: z.boolean(),
  classes: z.array(z.string()),
  description: z.string(),
  higherLevels: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SpellPartialSchema = SpellSchema.partial()

// Correctable subset: nothing at the top level qualifies. Spell's actual
// parser-inferred content (scaling, damageRoll/damageTypes, savingThrow,
// attackRoll, materialConsumed) all lives inside the single opaque
// `extraData` blob, which — per Monster's own reference implementation —
// isn't picked as a whole; per-key correction there is deferred, not built
// this pass. level/school/castingTime/range/components/duration/
// concentration/ritual/classes are direct copies of source fields, not
// parser inferences, so they're excluded too.
export const SpellCorrectableSchema = SpellSchema.pick({}).strict()

export type Spell = z.infer<typeof SpellSchema>

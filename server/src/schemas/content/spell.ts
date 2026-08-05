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

export type Spell = z.infer<typeof SpellSchema>

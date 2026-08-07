import { z } from 'zod'
import { abilityBonusGrantSchema, nameOnlyGrantSchema } from './shared.js'

const speedSchema = z.object({
  walk: z.number().int().nonnegative(),
  fly: z.number().int().nonnegative().optional(),
  swim: z.number().int().nonnegative().optional(),
})

const traitSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  level: z.number().int().positive(),
  grant: z.union([nameOnlyGrantSchema, abilityBonusGrantSchema]).optional(),
})

export const RaceSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  size: z.array(z.string()).min(1),
  speed: speedSchema,
  traits: z.array(traitSchema),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
  parentRaceId: z.string().nullable().optional(),
})

export const RacePartialSchema = RaceSchema.partial()

// Correctable subset: parentRaceId is resolved by slug/name lookup against
// other Race rows for real 2014-style subspecies — a genuine parser
// inference. size/speed/traits are largely a direct structural transcription
// of source content, not an inference; description is raw prose.
export const RaceCorrectableSchema = RaceSchema.pick({
  parentRaceId: true,
}).strict()

export const SubraceSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  raceId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  size: z.array(z.string()).nullable().optional(),
  speed: speedSchema.nullable().optional(),
  traits: z.array(traitSchema),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SubracePartialSchema = SubraceSchema.partial()

// Correctable subset: raceId is resolved the same way as Subclass.classId
// (cross-source parent matching, extraData.unresolvedRaceName on failure).
export const SubraceCorrectableSchema = SubraceSchema.pick({
  raceId: true,
}).strict()

export type Race = z.infer<typeof RaceSchema>
export type Subrace = z.infer<typeof SubraceSchema>
export type RaceTrait = z.infer<typeof traitSchema>

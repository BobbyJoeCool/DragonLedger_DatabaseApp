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
  edition: z.enum(['5e', '5.5e']).optional(),
  size: z.array(z.string()).min(1),
  speed: speedSchema,
  traits: z.array(traitSchema),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
  parentRaceId: z.string().nullable().optional(),
})

export const RacePartialSchema = RaceSchema.partial()

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the fixed lock list (name/slug/
// sourceId) — the roadmap's lock list only names the parent-relation FK on
// Subclass/Subrace, not Race.parentRaceId (a same-type self-relation for
// 2014-style subspecies-as-races, not a cross-type parent link), so it stays
// correctable here, consistent with the old rule.
export const RaceCorrectableSchema = RaceSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export const SubraceSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  raceId: z.string().nullable().optional(),
  name: z.string().min(1),
  edition: z.enum(['5e', '5.5e']).optional(),
  description: z.string().nullable().optional(),
  size: z.array(z.string()).nullable().optional(),
  speed: speedSchema.nullable().optional(),
  traits: z.array(traitSchema),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SubracePartialSchema = SubraceSchema.partial()

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the lock list — name/slug/
// sourceId plus raceId, the parent-relation FK, which is locked here
// (unlike the old per-field list, which had picked exactly this field as
// the *only* correctable one — the rule inverted, not just widened).
export const SubraceCorrectableSchema = SubraceSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
  raceId: true,
}).partial().strict()

export type Race = z.infer<typeof RaceSchema>
export type Subrace = z.infer<typeof SubraceSchema>
export type RaceTrait = z.infer<typeof traitSchema>

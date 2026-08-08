import { z } from 'zod'
import { nameOnlyGrantSchema } from './shared.js'

const primaryAbilitySchema = z.object({
  abilities: z.array(z.string()),
  logic: z.enum(['AND', 'OR']),
})

export const ClassSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  hitDie: z.number().int().positive(),
  primaryAbility: primaryAbilitySchema,
  savingThrows: z.array(z.string()),
  armorProfs: z.array(z.string()),
  weaponProfs: z.array(z.string()),
  skillChoices: nameOnlyGrantSchema,
  spellcastingAbility: z.string().nullable().optional(),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ClassPartialSchema = ClassSchema.partial()

// Correctable subset: source-type-based, not a per-field curated list (see
// phase-4-write-api-final-export.md §4). Every field is correctable except
// the fixed lock list (name/slug/sourceId).
export const ClassCorrectableSchema = ClassSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export const SubclassSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  classId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SubclassPartialSchema = SubclassSchema.partial()

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the fixed lock list — name/slug/
// sourceId plus classId, the parent-relation FK, which is locked here
// (unlike the old per-field list, which had picked exactly this field as
// the *only* correctable one — the rule inverted, not just widened).
export const SubclassCorrectableSchema = SubclassSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
  classId: true,
}).partial().strict()

export type Class = z.infer<typeof ClassSchema>
export type Subclass = z.infer<typeof SubclassSchema>

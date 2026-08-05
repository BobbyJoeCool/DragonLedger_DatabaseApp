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

export const SubclassSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  classId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SubclassPartialSchema = SubclassSchema.partial()

export type Class = z.infer<typeof ClassSchema>
export type Subclass = z.infer<typeof SubclassSchema>

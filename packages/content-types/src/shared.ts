import { z } from 'zod'

// Fixed/Choice Grant Shape — see Documentation/phase-2-import-final-export.md §4.1.
// Applies wherever official content mixes a fixed grant with a player choice.

// Exported (not just used locally) so client-side widgets — FixedChoiceGrantWidget
// in particular — can type their props against the same shapes the schema
// enforces, rather than re-declaring a parallel copy.
export const gradeEntrySchema = z.union([
  z.string(),
  z.object({ name: z.string(), category: z.string() }),
])

export const selectChoiceSchema = z.object({
  type: z.literal('select'),
  count: z.number().int().positive(),
  from: z.array(gradeEntrySchema).nullable(),
  amount: z.number().int().nullable().optional(),
})

export const distributeChoiceSchema = z.object({
  type: z.literal('distribute'),
  pool: z.number().int().positive(),
  among: z.array(gradeEntrySchema),
  maxPerOption: z.number().int().positive(),
})

export const grantChoiceSchema = z.union([selectChoiceSchema, distributeChoiceSchema])

export function fixedChoiceGrantSchema<T extends z.ZodTypeAny>(fixedSchema: T) {
  return z.object({
    fixed: fixedSchema,
    choices: z.array(grantChoiceSchema),
  })
}

export const nameOnlyGrantSchema = fixedChoiceGrantSchema(z.array(gradeEntrySchema))
export const abilityBonusGrantSchema = fixedChoiceGrantSchema(z.record(z.string(), z.number()))

export type GradeEntry = z.infer<typeof gradeEntrySchema>
export type SelectChoice = z.infer<typeof selectChoiceSchema>
export type DistributeChoice = z.infer<typeof distributeChoiceSchema>
export type GrantChoice = z.infer<typeof grantChoiceSchema>
export type FixedChoiceGrant<F> = { fixed: F; choices: GrantChoice[] }

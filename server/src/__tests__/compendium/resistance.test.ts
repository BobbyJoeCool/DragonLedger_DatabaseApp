import { describe, expect, it } from 'vitest'
import { parseCompositeResistanceList } from '../../importers/shared/resistance.js'

describe('parseCompositeResistanceList', () => {
  it('returns an empty array for empty/missing input', () => {
    expect(parseCompositeResistanceList(null)).toEqual([])
    expect(parseCompositeResistanceList('')).toEqual([])
  })

  it('parses a single plain damage type as a simple entry', () => {
    expect(parseCompositeResistanceList('fire')).toEqual([
      { types: ['fire'], nonmagical: false, bypassedBy: null },
    ])
  })

  it('recognizes the composite "physical from nonmagical, unless silvered" template as one atomic entry', () => {
    const result = parseCompositeResistanceList(
      "bludgeoning, piercing, and slashing damage from nonmagical attacks that aren't silvered",
    )
    expect(result).toHaveLength(1)
    expect(result[0].types).toEqual(expect.arrayContaining(['bludgeoning', 'piercing', 'slashing']))
    expect(result[0].nonmagical).toBe(true)
  })

  it('splits multiple semicolon-separated clauses into separate entries', () => {
    const result = parseCompositeResistanceList('poison; fire')
    expect(result).toEqual([
      { types: ['poison'], nonmagical: false, bypassedBy: null },
      { types: ['fire'], nonmagical: false, bypassedBy: null },
    ])
  })

  it('falls back to storing the raw clause when no recognized damage-type word is found', () => {
    const result = parseCompositeResistanceList('charmed')
    expect(result).toEqual([{ types: ['charmed'], nonmagical: false, bypassedBy: null }])
  })

  it('splits a multi-condition clause into separate condition names, not one opaque string (real fixed bug)', () => {
    const result = parseCompositeResistanceList('charmed, exhaustion, frightened, poisoned')
    expect(result).toEqual([
      {
        types: ['charmed', 'exhaustion', 'frightened', 'poisoned'],
        nonmagical: false,
        bypassedBy: null,
      },
    ])
  })
})

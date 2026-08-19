import { describe, expect, it } from 'vitest'
import { transformBackground } from '../../importers/open5e/backgrounds.js'
import type { Open5eBackground } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformBackground', () => {
  it('applies the standard 2024 distribute rule to the 3-ability benefit', () => {
    const raw = loadFixtureResult<Open5eBackground>('acolyte.json')
    const row = transformBackground(raw, 'test-source', '5.5e')
    const abilityBonuses = JSON.parse(row.abilityBonuses)
    expect(abilityBonuses.choices[0]).toEqual({
      type: 'distribute',
      pool: 3,
      among: ['INT', 'WIS', 'CHA'],
      maxPerOption: 2,
    })
  })

  it('parses a fixed 2-skill grant, tagged by category', () => {
    const raw = loadFixtureResult<Open5eBackground>('acolyte.json')
    const row = transformBackground(raw, 'test-source', '5.5e')
    const proficiencies = JSON.parse(row.proficiencies)
    expect(proficiencies.fixed).toEqual(
      expect.arrayContaining([
        { name: 'Insight', category: 'skill' },
        { name: 'Religion', category: 'skill' },
      ]),
    )
  })

  it('routes the feat benefit to extraData.grantedFeat since no dedicated column exists', () => {
    const raw = loadFixtureResult<Open5eBackground>('acolyte.json')
    const row = transformBackground(raw, 'test-source', '5.5e')
    const extra = JSON.parse(row.extraData!)
    expect(extra.grantedFeat.name).toBe('Magic Initiate (Cleric)')
  })

  it('detects a tool-proficiency choice ("Choose one kind of Gaming Set")', () => {
    const raw = loadFixtureResult<Open5eBackground>('bg_Soldier.json')
    const row = transformBackground(raw, 'test-source', '5.5e')
    const proficiencies = JSON.parse(row.proficiencies)
    const toolChoice = proficiencies.choices.find((c: { from: { category: string }[] | null }) =>
      c.from?.some((f) => f.category === 'tool'),
    )
    expect(toolChoice).toBeDefined()
    expect(toolChoice.count).toBe(1)
  })
})

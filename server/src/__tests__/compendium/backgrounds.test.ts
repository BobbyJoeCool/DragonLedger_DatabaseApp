import { describe, expect, it } from 'vitest'
import { transformCompendiumBackground } from '../../importers/compendium/backgrounds.js'
import type { CompendiumBackground } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformCompendiumBackground', () => {
  it('reads skill proficiencies from the standalone <proficiency> tag, not prose bullets', () => {
    const raw = compendiumFixture<CompendiumBackground>('acolyteBackground')
    const { row } = transformCompendiumBackground(raw)

    const proficiencies = JSON.parse(row.proficiencies)
    expect(proficiencies.fixed).toEqual(
      expect.arrayContaining([
        { name: 'Insight', category: 'skill' },
        { name: 'Religion', category: 'skill' },
      ]),
    )
  })

  it('reads the ability-score trio from the "Ability Scores: X, Y, Z" trait name and applies the standard distribute rule', () => {
    const raw = compendiumFixture<CompendiumBackground>('acolyteBackground')
    const { row } = transformCompendiumBackground(raw)

    const abilityBonuses = JSON.parse(row.abilityBonuses)
    expect(abilityBonuses.choices[0]).toMatchObject({
      type: 'distribute',
      pool: 3,
      maxPerOption: 2,
    })
  })

  it('routes the "Feat: X" trait to extraData.grantedFeat', () => {
    const raw = compendiumFixture<CompendiumBackground>('acolyteBackground')
    const { row } = transformCompendiumBackground(raw)

    const extra = JSON.parse(row.extraData!)
    expect(extra.grantedFeat.name).toBe('Magic Initiate (Cleric)')
  })
})

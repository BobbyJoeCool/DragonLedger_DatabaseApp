import { describe, expect, it } from 'vitest'
import {
  composeAttackDice,
  formatChallengeRating,
  inferProficiencyBonus,
  transformMonster,
} from '../../importers/open5e/monsters.js'
import type { Open5eCreature } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('formatChallengeRating', () => {
  it('formats fractional and whole CRs from the raw float the API actually returns', () => {
    expect(formatChallengeRating(0.25)).toBe('1/4')
    expect(formatChallengeRating(0.125)).toBe('1/8')
    expect(formatChallengeRating(0.5)).toBe('1/2')
    expect(formatChallengeRating(12)).toBe('12')
  })
})

describe('composeAttackDice', () => {
  it('composes count/type/bonus/damage-type from the three split fields', () => {
    const dice = composeAttackDice({
      to_hit_mod: 4,
      damage_die_count: 1,
      damage_die_type: 'D6',
      damage_bonus: 2,
      extra_damage_type: { name: 'Slashing', key: 'slashing' },
    })
    expect(dice).toBe('1d6+2 slashing')
  })
})

describe('transformMonster (Goblin Warrior — simple)', () => {
  it('maps core fields and converts the float CR to a display string', () => {
    const raw = loadFixtureResult<Open5eCreature>('goblinw.json')
    const row = transformMonster(raw, 'test-source', '5.5e')

    expect(row.challengeRating).toBe('1/4')
    expect(row.size).toBe('small')

    const actions = JSON.parse(row.actions)
    const scimitar = actions.find((a: { name: string }) => a.name === 'Scimitar')
    expect(scimitar.toHitMod).toBe(4)
    expect(scimitar.damage).toBe('1d6+2 slashing')
  })

  it('stores all six saving throw values as given, not filtered to proficient-only', () => {
    const raw = loadFixtureResult<Open5eCreature>('goblinw.json')
    const row = transformMonster(raw, 'test-source', '5.5e')
    const savingThrows = JSON.parse(row.savingThrows!)
    expect(Object.keys(savingThrows)).toHaveLength(6)
  })
})

describe('transformMonster (Archmage — complex, spellcasting)', () => {
  it('parses the Spellcasting action into extraData.spellcasting, additive to the raw action entry', () => {
    const raw = loadFixtureResult<Open5eCreature>('archmage.json')
    const row = transformMonster(raw, 'test-source', '5.5e')

    const extra = JSON.parse(row.extraData!)
    expect(extra.spellcasting.ability).toBe('Intelligence')
    expect(extra.spellcasting.saveDC).toBe(17)
    expect(extra.spellcasting.atWill).toContain('Detect Magic')
    expect(extra.spellcasting.limitedUse).toEqual(
      expect.arrayContaining([expect.objectContaining({ frequency: '2/Day Each' })]),
    )

    const actions = JSON.parse(row.actions)
    expect(actions.some((a: { name: string }) => a.name === 'Spellcasting')).toBe(true)
  })

  it('infers proficiency bonus from CR when the raw field is null', () => {
    const raw = loadFixtureResult<Open5eCreature>('archmage.json')
    expect(raw.proficiency_bonus).toBeNull()
    const row = transformMonster(raw, 'test-source', '5.5e')
    const extra = JSON.parse(row.extraData!)
    expect(extra.proficiencyBonus).toBe(inferProficiencyBonus(12))
  })

  it('writes experiencePoints to its own column (Phase 2.6), not extraData', () => {
    const raw = loadFixtureResult<Open5eCreature>('archmage.json')
    const row = transformMonster(raw, 'test-source', '5.5e')
    expect(row.experiencePoints).toBe(8400)
    const extra = JSON.parse(row.extraData!)
    expect(extra.experiencePoints).toBeUndefined()
  })

  it('parses the real damage_immunities_display/condition_immunities_display prose into the unified {types,nonmagical,bypassedBy} shape (Phase 2.6)', () => {
    const raw = loadFixtureResult<Open5eCreature>('archmage.json')
    expect(raw.resistances_and_immunities.damage_immunities_display).toBe('psychic')
    const row = transformMonster(raw, 'test-source', '5.5e')
    expect(JSON.parse(row.damageImmunities!)).toEqual([
      { types: ['psychic'], nonmagical: false, bypassedBy: null },
    ])
    expect(JSON.parse(row.conditionImmunities!)).toEqual([
      { types: ['charmed'], nonmagical: false, bypassedBy: null },
    ])
    // Archmage has immunities but no resistances — damage_resistances_display
    // is "" (empty string, not null) on the real fixture, same shape
    // verified live against the API for creatures with none at all.
    expect(row.damageResistances).toBeNull()
  })
})

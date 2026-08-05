import { describe, expect, it } from 'vitest'
import { transformClass } from '../../importers/open5e/classes.js'
import type { Open5eClass } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformClass', () => {
  it("parses Cleric's CORE_TRAITS_TABLE for proficiencies and a single primary ability", () => {
    const raw = loadFixtureResult<Open5eClass>('cleric.json')
    const row = transformClass(raw, 'test-source')

    expect(row.hitDie).toBe(8)
    expect(JSON.parse(row.primaryAbility)).toEqual({ abilities: ['WIS'], logic: 'OR' })
    expect(row.spellcastingAbility).toBe('WIS')

    const skillChoices = JSON.parse(row.skillChoices)
    expect(skillChoices.choices[0]).toMatchObject({ type: 'select', count: 2 })
    expect(skillChoices.choices[0].from).toContain('Religion')

    expect(JSON.parse(row.weaponProfs)).toEqual(['Simple weapons'])
    expect(JSON.parse(row.armorProfs)[0]).toContain('Light and Medium')
  })

  it('parses Fighter\'s OR-logic primary ability from "Strength or Dexterity"', () => {
    const raw = loadFixtureResult<Open5eClass>('cls_Fighter.json')
    const row = transformClass(raw, 'test-source')
    expect(JSON.parse(row.primaryAbility)).toEqual({ abilities: ['STR', 'DEX'], logic: 'OR' })
  })

  it('parses Paladin\'s AND-logic primary ability from "Strength and Charisma"', () => {
    const raw = loadFixtureResult<Open5eClass>('cls_Paladin.json')
    const row = transformClass(raw, 'test-source')
    expect(JSON.parse(row.primaryAbility)).toEqual({ abilities: ['STR', 'CHA'], logic: 'AND' })
  })

  it('infers hitDie from the nested hit_points object', () => {
    const raw = loadFixtureResult<Open5eClass>('cleric.json')
    expect(raw.hit_points?.hit_dice).toBe('D8')
    const row = transformClass(raw, 'test-source')
    expect(row.hitDie).toBe(8)
  })
})

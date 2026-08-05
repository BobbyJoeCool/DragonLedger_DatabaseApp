import { describe, expect, it } from 'vitest'
import {
  extractAttackRoll,
  extractDamage,
  extractMaterialConsumed,
  extractSavingThrow,
  transformSpellOrManeuver,
} from '../../importers/compendium/spells.js'
import type { CompendiumSpell } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformSpellOrManeuver', () => {
  it('maps a real Fireball record as a spell, with school code decoded', () => {
    const raw = compendiumFixture<CompendiumSpell>('fireball')
    const result = transformSpellOrManeuver(raw)

    expect(result.kind).toBe('spell')
    if (result.kind === 'spell') {
      expect(result.row.name).toBe('Fireball')
      expect(result.row.level).toBe(3)
      expect(result.row.school).toBe('evocation')
    }
  })

  it('reroutes a real Maneuver record to ContentClassOption, stripping the pool prefix from its name', () => {
    const raw = compendiumFixture<CompendiumSpell>('maneuver')
    const result = transformSpellOrManeuver(raw)

    expect(result.kind).toBe('classOption')
    if (result.kind === 'classOption') {
      expect(result.row.pool).toBe('Maneuver')
      expect(result.row.name).toBe('Ambush')
      expect(result.row.name).not.toContain('Maneuver:')
    }
  })

  it('writes extraData.scaling from <roll> in the unified shape, trigger decided from spell level (Phase 2.6)', () => {
    const raw = compendiumFixture<CompendiumSpell>('fireball')
    const result = transformSpellOrManeuver(raw)

    expect(result.kind).toBe('spell')
    if (result.kind !== 'spell') return
    const extra = JSON.parse(result.row.extraData!)
    expect(extra.scalingDice).toBeUndefined() // renamed away
    expect(extra.scaling).toEqual([
      { trigger: 'slot_level', triggerValue: 3, dice: '8d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 4, dice: '9d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 5, dice: '10d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 6, dice: '11d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 7, dice: '12d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 8, dice: '13d6', description: 'Fire Damage' },
      { trigger: 'slot_level', triggerValue: 9, dice: '14d6', description: 'Fire Damage' },
    ])
  })

  it('prose-parses savingThrow and base damageRoll/damageTypes from the real description text (Phase 2.6)', () => {
    const raw = compendiumFixture<CompendiumSpell>('fireball')
    const result = transformSpellOrManeuver(raw)

    expect(result.kind).toBe('spell')
    if (result.kind !== 'spell') return
    const extra = JSON.parse(result.row.extraData!)
    expect(extra.savingThrow).toBe('dexterity')
    expect(extra.damageRoll).toBe('8d6')
    expect(extra.damageTypes).toEqual(['fire'])
    // Real text has no "spell attack" phrase and the material component
    // ("a ball of bat guano and sulfur") isn't consumed — both correctly absent.
    expect(extra.attackRoll).toBeUndefined()
    expect(extra.materialConsumed).toBeUndefined()
  })
})

describe('spell prose-parsers (Phase 2.6, real text patterns)', () => {
  it('extractSavingThrow finds the ability word immediately before "saving throw"', () => {
    expect(extractSavingThrow('makes a Constitution saving throw')).toBe('constitution')
    expect(extractSavingThrow('no save mentioned here')).toBeNull()
  })

  it('extractDamage handles both dice and the rarer flat-number case', () => {
    expect(extractDamage('takes 5d10 Force damage from the attack')).toEqual({
      damageRoll: '5d10',
      damageTypes: ['force'],
    })
    expect(extractDamage('the creature takes 5 Cold damage')).toEqual({
      damageRoll: '5',
      damageTypes: ['cold'],
    })
    expect(extractDamage('no damage here')).toEqual({ damageRoll: null, damageTypes: [] })
  })

  it('extractAttackRoll detects "spell attack" text', () => {
    expect(extractAttackRoll('Make a melee spell attack against a creature')).toBe(true)
    expect(extractAttackRoll('makes a Dexterity saving throw')).toBe(false)
  })

  it('extractMaterialConsumed detects a real consumption clause in the components field', () => {
    expect(
      extractMaterialConsumed('V, S, M (an onyx worth 50+ GP, which the spell consumes)'),
    ).toBe(true)
    expect(
      extractMaterialConsumed('V, S, M (30 feet of cord or rope, which is consumed by the spell)'),
    ).toBe(true)
    expect(extractMaterialConsumed('V, S, M (a shard of blue glass)')).toBe(false)
  })
})

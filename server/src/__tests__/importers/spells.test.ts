import { describe, expect, it } from 'vitest'
import { transformSpell } from '../../importers/open5e/spells.js'
import type { Open5eSpell } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformSpell', () => {
  it('maps a real Fireball record correctly', () => {
    const raw = loadFixtureResult<Open5eSpell>('fireball2.json')
    const row = transformSpell(raw, 'test-source', '5.5e')

    expect(row.slug).toBe('fireball')
    expect(row.level).toBe(3)
    expect(row.school).toBe('evocation')
    expect(row.components).toBe('V, S, M')
    expect(row.material).toBe(raw.material_specified)
    expect(JSON.parse(row.classes)).toEqual(['Sorcerer', 'Wizard'])
    expect(row.concentration).toBe(false)
    expect(row.ritual).toBe(false)

    const extra = JSON.parse(row.extraData!)
    expect(extra.damageRoll).toBe('8d6')
    expect(extra.damageTypes).toEqual(['fire'])
    expect(extra.shapeType).toBe('sphere')
    expect(extra.shapeSize).toBe(20)
  })

  it('writes extraData.scaling in the unified shape, trigger decided from spell.level (Phase 2.6)', () => {
    const raw = loadFixtureResult<Open5eSpell>('fireball2.json')
    expect(raw.level).toBe(3) // non-cantrip → slot_level trigger, not character_level
    const row = transformSpell(raw, 'test-source', '5.5e')

    const extra = JSON.parse(row.extraData!)
    expect(extra.castingOptions).toBeUndefined() // renamed away, not left alongside
    expect(extra.scaling).toEqual([
      { trigger: 'slot_level', triggerValue: 4, dice: '9d6', description: null },
      { trigger: 'slot_level', triggerValue: 5, dice: '10d6', description: null },
      { trigger: 'slot_level', triggerValue: 6, dice: '11d6', description: null },
      { trigger: 'slot_level', triggerValue: 7, dice: '12d6', description: null },
      { trigger: 'slot_level', triggerValue: 8, dice: '13d6', description: null },
      { trigger: 'slot_level', triggerValue: 9, dice: '14d6', description: null },
    ])
  })
})

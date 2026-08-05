import { describe, expect, it } from 'vitest'
import { transformSpell } from '../../importers/open5e/spells.js'
import type { Open5eSpell } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformSpell', () => {
  it('maps a real Fireball record correctly', () => {
    const raw = loadFixtureResult<Open5eSpell>('fireball2.json')
    const row = transformSpell(raw, 'test-source')

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
})

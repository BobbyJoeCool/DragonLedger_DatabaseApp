import { describe, expect, it } from 'vitest'
import { transformSpellOrManeuver } from '../../importers/compendium/spells.js'
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
})

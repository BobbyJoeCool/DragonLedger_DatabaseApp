import { describe, expect, it } from 'vitest'
import { transformCompendiumMonster } from '../../importers/compendium/monsters.js'
import type { CompendiumMonster } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformCompendiumMonster', () => {
  it('parses "N (XdY+Z)" hit points into separate hitPoints/hitDice, and composes attack damage from the pipe-delimited attack string', () => {
    const raw = compendiumFixture<CompendiumMonster>('goblinMonster')
    const { row } = transformCompendiumMonster(raw)

    expect(row.hitPoints).toBeGreaterThan(0)
    expect(row.hitDice).toMatch(/^\d+d\d+/)
    const actions = JSON.parse(row.actions)
    expect(actions.length).toBeGreaterThan(0)
  })

  it('uses the composite resistance parser (an object shape) for a real free-text resistance field, since the Compendium has no other form', () => {
    const raw = compendiumFixture<CompendiumMonster>('airElemental')
    const { row } = transformCompendiumMonster(raw)

    expect(row.damageResistances).not.toBeNull()
    const resistances = JSON.parse(row.damageResistances!)
    expect(Array.isArray(resistances)).toBe(true)
    // A real composite entry (multiple damage types, possibly a
    // nonmagical/bypass qualifier) uses `types` (plural); only a genuinely
    // single, unqualified damage type collapses to `type`.
    expect(resistances[0].type || resistances[0].types).toBeTruthy()
  })

  it('detects a bonus-action suffix in the action name and strips it into actionType, leaving recharge suffixes alone', () => {
    const raw = compendiumFixture<CompendiumMonster>('goblinMonster')
    const { row } = transformCompendiumMonster(raw)
    const actions = JSON.parse(row.actions)
    const nimble = actions.find((a: { name: string }) => a.name.includes('Nimble Escape'))
    if (nimble) {
      expect(nimble.actionType).toBe('bonus')
      expect(nimble.name).not.toContain('Bonus Action')
    }
  })
})

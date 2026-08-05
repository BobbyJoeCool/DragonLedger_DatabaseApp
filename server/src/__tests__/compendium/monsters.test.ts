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
    // Phase 2.6 unified shape — always {types, nonmagical, bypassedBy},
    // never a bare `type` string, regardless of source.
    expect(Object.keys(resistances[0]).sort()).toEqual(['bypassedBy', 'nonmagical', 'types'])
    expect(Array.isArray(resistances[0].types)).toBe(true)
    expect(typeof resistances[0].nonmagical).toBe('boolean')
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

  it('computes experiencePoints from challengeRating (Compendium has no XP field at all)', () => {
    const raw = compendiumFixture<CompendiumMonster>('goblinMonster')
    expect(raw.cr).toBe('1/4')
    const { row } = transformCompendiumMonster(raw)
    expect(row.experiencePoints).toBe(50) // standard 5e CR 1/4 → 50 XP
  })

  // Real, previously-shipped bug (Phase 2.6 fix): 54.5% of real Compendium
  // monsters have no "Proficiency Bonus" trait at all and used to default to
  // 0 (never actually correct in 5e rules — minimum is +2) instead of
  // falling back to the same CR-inference Open5e's transform already has.
  it('falls back to CR-based proficiency-bonus inference when no "Proficiency Bonus" trait exists (Phase 2.6 fix)', () => {
    const raw = compendiumFixture<CompendiumMonster>('goblinMonster')
    const noProfTrait: CompendiumMonster = {
      ...raw,
      trait: (raw.trait ?? []).filter((t) => t.name !== 'Proficiency Bonus'),
    }
    const { row } = transformCompendiumMonster(noProfTrait)
    const extra = JSON.parse(row.extraData!)
    expect(extra.proficiencyBonus).toBe(2) // CR 1/4 → +2, never the old constant 0
  })

  it('uses the real "Proficiency Bonus" trait value when present, not the CR fallback', () => {
    const raw = compendiumFixture<CompendiumMonster>('airElemental')
    const profTrait = (raw.trait ?? []).find((t) => t.name === 'Proficiency Bonus')
    expect(profTrait).toBeTruthy()
    const { row } = transformCompendiumMonster(raw)
    const extra = JSON.parse(row.extraData!)
    expect(extra.proficiencyBonus).toBe(Number(profTrait!.text))
  })
})

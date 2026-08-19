import { describe, expect, it } from 'vitest'
import { transformCompendiumClass } from '../../importers/compendium/classes.js'
import type { CompendiumClass } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformCompendiumClass', () => {
  it("parses the <proficiency> field's leading ability names as saving throws and the rest as the skill pool", () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { classResult } = transformCompendiumClass(raw)

    expect(classResult.row.name).toBe('Cleric')
    expect(classResult.row.hitDie).toBe(8)
    expect(JSON.parse(classResult.row.savingThrows)).toEqual(['Wisdom', 'Charisma'])
    const skillChoices = JSON.parse(classResult.row.skillChoices)
    expect(skillChoices.choices[0].count).toBe(2)
    expect(skillChoices.choices[0].from).toContain('Religion')
  })

  it('detects subclasses via the "<Class> Subclass: <Name>" marker feature, not a naive parenthetical suffix', () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { subclasses } = transformCompendiumClass(raw)

    const names = subclasses.map((s) => s.row.name)
    expect(names).toEqual(expect.arrayContaining(['Life Domain', 'Light Domain', 'War Domain']))
    // A lore-only feature with a trailing parenthetical ("Veilmark
    // Information (Zamanora)") must NOT be misdetected as a subclass —
    // this is exactly the false-positive the naive rule would produce.
    expect(names).not.toContain('Zamanora')
  })

  it("carries the real parent class name on each subclass, not the subclass's own name", () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { subclasses } = transformCompendiumClass(raw)

    const warDomain = subclasses.find((s) => s.row.name === 'War Domain')!
    expect(warDomain.parentClassName).toBe('Cleric')
  })

  it('tags a (Legacy) subclass variant as 5e edition, distinct from the untagged 5.5e version', () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { subclasses } = transformCompendiumClass(raw)

    const legacyKnowledge = subclasses.filter((s) => s.row.name === 'Knowledge Domain')
    expect(legacyKnowledge.length).toBeGreaterThanOrEqual(2)
    const editions = legacyKnowledge.map((s) => s.row.edition)
    expect(editions).toEqual(expect.arrayContaining(['5e']))
  })

  it('skips a subclass marker with no name surviving tag-stripping rather than failing the whole class (real malformed data)', () => {
    const raw = compendiumFixture<CompendiumClass>('wizard')
    const { classResult, subclasses } = transformCompendiumClass(raw)

    // Wizard's real file has several "Wizard Subclass:  (Legacy)" blank
    // markers alongside its real subclasses — the class and its valid
    // subclasses must still come through.
    expect(classResult.row.name).toBe('Wizard')
    expect(subclasses.map((s) => s.row.name)).toEqual(expect.arrayContaining(['Abjurer', 'Evoker']))
  })

  it('infers casterType FULL for a real long-rest full caster (Phase 2.6 — Compendium has no direct field for this)', () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    expect(raw.spellAbility).toBe('Wisdom')
    expect(raw.slotsReset).toBe('L') // long rest alone can't distinguish FULL from HALF
    const { classResult } = transformCompendiumClass(raw)
    const extra = JSON.parse(classResult.row.extraData!)
    expect(extra.casterType).toBe('FULL')
    expect(extra.features).toBeUndefined() // moved to ContentClassFeature, Phase 2.6
  })

  it('populates classFeatures as one row per level, matching the native <autolevel level="N"> granularity', () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { classFeatures } = transformCompendiumClass(raw)

    expect(classFeatures.length).toBeGreaterThan(0)
    for (const f of classFeatures) {
      expect(typeof f.level).toBe('number')
      expect(f.name).toBeTruthy()
      expect(f.type).toBeNull() // Compendium has no equivalent of Open5e's feature-type tag
    }
  })

  it("populates each subclass's own features array, separate from the base class's", () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { subclasses } = transformCompendiumClass(raw)

    const lifeDomain = subclasses.find((s) => s.row.name === 'Life Domain')!
    expect(lifeDomain.features.length).toBeGreaterThan(0)
    expect(lifeDomain.features.every((f) => typeof f.level === 'number')).toBe(true)
  })
})

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

  it('tags a (Legacy) subclass variant as 2014 edition, distinct from the untagged 2024 version', () => {
    const raw = compendiumFixture<CompendiumClass>('cleric')
    const { subclasses } = transformCompendiumClass(raw)

    const legacyKnowledge = subclasses.filter((s) => s.row.name === 'Knowledge Domain')
    expect(legacyKnowledge.length).toBeGreaterThanOrEqual(2)
    const editions = legacyKnowledge.map((s) => JSON.parse(s.row.extraData!).edition ?? null)
    expect(editions).toEqual(expect.arrayContaining(['2014']))
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
})

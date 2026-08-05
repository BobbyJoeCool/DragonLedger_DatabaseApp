import { describe, expect, it } from 'vitest'
import { synthesizeSubracesFromLineageTrait, transformRace } from '../../importers/open5e/races.js'
import type { Open5eSpecies } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformRace', () => {
  it('extracts size/speed from named traits and excludes the lineage trait from base traits', () => {
    const raw = loadFixtureResult<Open5eSpecies>('elf.json')
    const row = transformRace(raw, 'test-source')

    expect(row.slug).toBe('elf')
    expect(JSON.parse(row.size)).toEqual(['medium'])
    expect(JSON.parse(row.speed)).toEqual({ walk: 30 })

    const traitNames = JSON.parse(row.traits).map((t: { name: string }) => t.name)
    expect(traitNames).not.toContain('Size')
    expect(traitNames).not.toContain('Speed')
    expect(traitNames).not.toContain('Elven Lineage')
    expect(traitNames).toEqual(
      expect.arrayContaining(['Darkvision', 'Fey Ancestry', 'Keen Senses', 'Trance']),
    )
  })
})

describe('synthesizeSubracesFromLineageTrait', () => {
  it("parses Elf's 4-column lineage table into 3 subraces named after the table row", () => {
    const raw = loadFixtureResult<Open5eSpecies>('elf.json')
    const subraces = synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')

    expect(subraces.map((s) => s.name).sort()).toEqual(['Drow', 'High Elf', 'Wood Elf'])
    const woodElf = subraces.find((s) => s.name === 'Wood Elf')!
    expect(woodElf.raceId).toBe('race-id')
    expect(woodElf.slug).toBe('elf-wood-elf')
    const traits = JSON.parse(woodElf.traits)
    expect(traits).toHaveLength(3)
    expect(traits[0].description).toContain('35 feet')
  })

  it("parses Dragonborn's 2-column ancestor/damage-type table into 10 subraces", () => {
    const raw = loadFixtureResult<Open5eSpecies>('sp_Dragonborn.json')
    const subraces = synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')

    expect(subraces).toHaveLength(10)
    const black = subraces.find((s) => s.name === 'Black')!
    expect(JSON.parse(black.traits)[0].description).toContain('Acid')
  })

  it("parses Gnome's bold-paragraph prose (no table) into 2 options", () => {
    const raw = loadFixtureResult<Open5eSpecies>('sp_Gnome.json')
    const subraces = synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')

    expect(subraces.map((s) => s.name).sort()).toEqual(['Forest Gnome', 'Rock Gnome'])
  })

  it("parses Goliath's dash-bullet prose, naming each option after its parenthetical ancestor", () => {
    const raw = loadFixtureResult<Open5eSpecies>('sp_Goliath.json')
    const subraces = synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')

    expect(subraces.map((s) => s.name).sort()).toEqual(
      [
        'Cloud Giant',
        'Fire Giant',
        'Frost Giant',
        'Hill Giant',
        'Stone Giant',
        'Storm Giant',
      ].sort(),
    )
  })

  it("parses Tiefling's 4-column legacy table", () => {
    const raw = loadFixtureResult<Open5eSpecies>('sp_Tiefling.json')
    const subraces = synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')

    expect(subraces.map((s) => s.name).sort()).toEqual(['Abyssal', 'Chthonic', 'Infernal'])
  })

  it('returns no subraces for a race with no lineage trait', () => {
    const raw = loadFixtureResult<Open5eSpecies>('sp_Dwarf.json')
    expect(synthesizeSubracesFromLineageTrait('race-id', raw, 'test-source')).toEqual([])
  })
})

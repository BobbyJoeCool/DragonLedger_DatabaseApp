import { describe, expect, it } from 'vitest'
import {
  stripDuplicatedParentDescription,
  transformCompendiumRace,
} from '../../importers/compendium/races.js'
import type { CompendiumRace } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformCompendiumRace', () => {
  it('routes a real "ParentRace, SubraceName" record to the subrace path, using the outside-parens comma', () => {
    const raw = compendiumFixture<CompendiumRace>('woodElfSubrace')
    const result = transformCompendiumRace(raw)

    expect(result.kind).toBe('subrace')
    if (result.kind === 'subrace') {
      expect(result.parentName).toBe('Elf')
      const row = result.buildRow('some-parent-id', null)
      expect(row.name).toBe('Wood')
    }
  })

  it('does not split on a comma nested inside parentheses (real campaign-setting variant shape)', () => {
    const raw: CompendiumRace = { name: 'Human (Innistrad, Kessig)', trait: [] }
    const result = transformCompendiumRace(raw)
    // No outside-parens comma exists, so this must import as an
    // independent race, not attempt (and fail) to parse "Human (Innistrad"
    // as a parent name.
    expect(result.kind).toBe('race')
  })
})

describe('stripDuplicatedParentDescription', () => {
  it('strips only the paragraphs that match the parent, keeping subrace-specific content', () => {
    const parent = 'Shared origin lore.\n\nMore shared lore.'
    const sub = 'Shared origin lore.\n\nMore shared lore.\n\nWood Elf specific content.'
    const result = stripDuplicatedParentDescription(sub, parent)
    expect(result.skipped).toBe(false)
    expect(result.description).toBe('Wood Elf specific content.')
  })

  it('strips nothing when no parent description is available (mandatory safeguard)', () => {
    const result = stripDuplicatedParentDescription('Some text.', null)
    expect(result.skipped).toBe(true)
    expect(result.description).toBe('Some text.')
  })

  it('strips nothing when no confident paragraph match exists, rather than guessing', () => {
    const result = stripDuplicatedParentDescription(
      'Completely different text.',
      'Unrelated parent lore.',
    )
    expect(result.skipped).toBe(true)
    expect(result.description).toBe('Completely different text.')
  })
})

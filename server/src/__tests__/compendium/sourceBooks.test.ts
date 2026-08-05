import { describe, expect, it } from 'vitest'
import {
  resolveCompendiumSource,
  UNCREDITED_SOURCE_ID,
} from '../../importers/compendium/sourceBooks.js'

describe('resolveCompendiumSource', () => {
  it('creates a per-book, Compendium-specific sourceId — never the Open5e document key itself', () => {
    const result = resolveCompendiumSource("Player's Handbook (2024)")
    expect(result.sourceId).toBe('compendium-player-s-handbook-2024')
    expect(result.mappedOpen5eDocumentKey).toBe('srd-2024')
  })

  it('maps known real book title variants to their Open5e document key', () => {
    expect(resolveCompendiumSource("Player's Handbook 2024").mappedOpen5eDocumentKey).toBe(
      'srd-2024',
    )
    expect(resolveCompendiumSource("Dungeon Master's Guide (2014)").mappedOpen5eDocumentKey).toBe(
      'srd-2014',
    )
    expect(
      resolveCompendiumSource("Tal'Dorei Campaign Setting: Reborn").mappedOpen5eDocumentKey,
    ).toBe('tdcs')
  })

  it('leaves unmapped books (the vast majority) with no Open5e cross-check at all', () => {
    const result = resolveCompendiumSource("Xanathar's Guide to Everything")
    expect(result.mappedOpen5eDocumentKey).toBeNull()
    expect(result.sourceId).toBe('compendium-xanathar-s-guide-to-everything')
  })

  it('falls back to the uncredited source when no citation was found at all', () => {
    const result = resolveCompendiumSource(null)
    expect(result.sourceId).toBe(UNCREDITED_SOURCE_ID)
    expect(result.mappedOpen5eDocumentKey).toBeNull()
  })
})

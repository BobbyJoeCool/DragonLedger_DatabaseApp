import { describe, expect, it } from 'vitest'
import { transformFeat } from '../../importers/compendium/feats.js'
import type { CompendiumFeat } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformFeat', () => {
  it("maps a real 'Origin:' prefixed feat to the ORIGIN category, name stripped of both prefix and edition tag", () => {
    const raw = compendiumFixture<CompendiumFeat>('alertFeat')
    const { row, source } = transformFeat(raw)

    expect(row.name).toBe('Alert')
    expect(row.category).toBe('ORIGIN')
    expect(row.sourceId).toBe(source.sourceId)
    expect(source.mappedOpen5eDocumentKey).toBe('srd-2024')
  })
})

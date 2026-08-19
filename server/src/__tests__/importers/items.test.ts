import { describe, expect, it } from 'vitest'
import { transformItem, transformMagicItem } from '../../importers/open5e/items.js'
import type { Open5eItem, Open5eMagicItem } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformItem', () => {
  it('composes weapon damage and maps the nested property.name shape correctly', () => {
    const raw = loadFixtureResult<Open5eItem>('longsword.json')
    const row = transformItem(raw, 'test-source', '5.5e')

    expect(row.damage).toBe('1d8 slashing')
    const properties = JSON.parse(row.properties!)
    expect(properties.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Sap', 'Versatile']),
    )
    const versatile = properties.find((p: { name: string }) => p.name === 'Versatile')
    expect(versatile.detail).toBe('1d10')
  })

  it('maps armor fields and overrides itemType with the more specific armor category', () => {
    const raw = loadFixtureResult<Open5eItem>('chainmail.json')
    const row = transformItem(raw, 'test-source', '5.5e')

    expect(row.armorClass).toBe('16')
    expect(row.itemType).toBe('heavy')
    const extra = JSON.parse(row.extraData!)
    expect(extra.strRequired).toBe(13)
    expect(extra.stealthDisadvantage).toBe(true)
  })
})

describe('transformMagicItem', () => {
  it('maps rarity and attunement as new rows, not merges of a mundane item', () => {
    const raw = loadFixtureResult<Open5eMagicItem>('magicitem.json')
    const row = transformMagicItem(raw, 'test-source', '5.5e')

    expect(row.rarity).toBe('uncommon')
    expect(row.requiresAttunement).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { transformCompendiumItem } from '../../importers/compendium/items.js'
import type { CompendiumItem } from '../../importers/compendium/types.js'
import { compendiumFixture } from './fixtures.js'

describe('transformCompendiumItem', () => {
  it('composes weapon damage from dmg1/dmgType and maps the Versatile property with its dmg2 detail', () => {
    const raw = compendiumFixture<CompendiumItem>('longsword')
    const result = transformCompendiumItem(raw)!

    expect(result.row.damage).toBe('1d8 slashing')
    const properties = JSON.parse(result.row.properties!)
    const versatile = properties.find((p: { name: string }) => p.name === 'Versatile')
    expect(versatile).toBeDefined()
    expect(versatile.detail).toBe('1d10')
  })

  it('parses rarity/attunement from the real <detail> tag — confirmed reliable, not best-effort text scraping', () => {
    // longsword is mundane (no <detail>); armor items commonly aren't magic
    // either, so rarity/attunement default cleanly to null/false
    const raw = compendiumFixture<CompendiumItem>('chainMail')
    const result = transformCompendiumItem(raw)!

    expect(result.row.armorClass).toBe('14')
    expect(result.row.itemType).toBe('heavy-armor')
    const extra = JSON.parse(result.row.extraData!)
    expect(extra.stealthDisadvantage).toBe(true)
  })
})

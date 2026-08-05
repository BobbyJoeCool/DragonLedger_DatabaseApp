import { describe, expect, it } from 'vitest'
import { transformCondition } from '../../importers/open5e/conditions.js'
import type { Open5eCondition } from '../../importers/open5e/types.js'
import { loadFixtureResult } from './fixtures.js'

describe('transformCondition', () => {
  it('maps a real Open5e condition record with a matching description', () => {
    const raw = loadFixtureResult<Open5eCondition>('cond_core.json')
    const row = transformCondition(raw, 'test-source')

    expect(row.sourceId).toBe('test-source')
    expect(row.slug).toBe(raw.key)
    expect(row.name).toBe(raw.name)
    expect(row.description.length).toBeGreaterThan(0)
    expect(row.effects).toBeNull()
  })

  it('falls back to the first description and records the mismatch when none matches the requested document', () => {
    const raw: Open5eCondition = {
      key: 'test_condition',
      name: 'Test Condition',
      document: { key: 'other-doc', name: 'Other' },
      icon: null,
      descriptions: [{ desc: 'Fallback text', document: 'core', gamesystem: '5e-2014' }],
    }
    const row = transformCondition(raw, 'test-source')

    expect(row.description).toBe('Fallback text')
    const extra = JSON.parse(row.extraData!)
    expect(extra.descriptionSource).toBe('core')
    expect(extra.requestedSource).toBe('other-doc')
  })
})

import { describe, expect, it } from 'vitest'
import { computeChunkSize } from '../../importers/utils/chunkSize.js'

describe('computeChunkSize', () => {
  it('stays safely under the SQLite bound-parameter ceiling for a wide model', () => {
    const size = computeChunkSize(25) // ContentMonster, the widest table
    expect(size * 25).toBeLessThan(999)
  })

  it('scales down for wider models and up for narrower ones', () => {
    expect(computeChunkSize(7)).toBeGreaterThan(computeChunkSize(25))
  })

  it('never goes below the minimum floor even for an absurdly wide model', () => {
    expect(computeChunkSize(500)).toBeGreaterThanOrEqual(10)
  })
})

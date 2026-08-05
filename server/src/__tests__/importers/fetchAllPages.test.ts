import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllPages } from '../../importers/utils/fetchAllPages.js'

describe('fetchAllPages', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('follows the `next` cursor until exhausted, concatenating results in order', async () => {
    const page1 = { results: [{ id: 1 }, { id: 2 }], next: 'https://example.com/page2' }
    const page2 = { results: [{ id: 3 }], next: null }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await fetchAllPages<{ id: number }>('https://example.com/page1')

    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/page2', undefined)
  })

  it('returns an empty array for a single empty page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ results: [], next: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await fetchAllPages('https://example.com/empty')

    expect(results).toEqual([])
  })
})

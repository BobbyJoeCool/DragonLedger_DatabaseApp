import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry } from '../../importers/utils/fetchWithRetry.js'

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns immediately on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithRetry('https://example.com')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 429, honoring Retry-After, then succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.com')
    await vi.runAllTimersAsync()
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails fast on a non-retryable 404 — no wasted attempts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithRetry('https://example.com')).rejects.toThrow(/404/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after 3 attempts on repeated 500s', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.com')
    const expectation = expect(promise).rejects.toThrow(/500/)
    await vi.runAllTimersAsync()
    await expectation

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

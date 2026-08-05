import { fetchWithRetry } from './fetchWithRetry.js'

interface PaginatedResponse<T> {
  results: T[]
  next: string | null
}

// Follows Open5e's `next` cursor until exhausted.
export async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = []
  let next: string | null = url

  while (next) {
    const res = await fetchWithRetry(next)
    const body = (await res.json()) as PaginatedResponse<T>
    results.push(...body.results)
    next = body.next
  }

  return results
}

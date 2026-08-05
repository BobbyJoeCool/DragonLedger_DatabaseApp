const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function delayFor(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader !== null) {
    const seconds = Number(retryAfterHeader)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000
    }
  }
  return BASE_DELAY_MS * 2 ** (attempt - 1)
}

// 3 attempts, base 500ms exponential backoff. Retries on network failure,
// 429 (honoring Retry-After), and 5xx. Any other non-ok status fails fast —
// retrying a 404 three times wastes the whole budget on something that will
// never succeed.
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (err) {
      lastError = err
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `fetchWithRetry: network failure after ${MAX_ATTEMPTS} attempts for ${url}: ${(err as Error).message}`,
        )
      }
      await sleep(delayFor(attempt, null))
      continue
    }

    if (response.ok) {
      return response
    }

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable) {
      throw new Error(`fetchWithRetry: ${response.status} ${response.statusText} for ${url}`)
    }

    lastError = new Error(`fetchWithRetry: ${response.status} ${response.statusText} for ${url}`)
    if (attempt === MAX_ATTEMPTS) {
      throw lastError
    }
    await sleep(delayFor(attempt, response.headers.get('Retry-After')))
  }

  // Unreachable — the loop always returns or throws — but keeps TS satisfied.
  throw lastError
}

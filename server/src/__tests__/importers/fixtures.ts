import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(__dirname, '../fixtures/open5e')

interface Open5ePage<T> {
  results: T[]
}

export function loadFixtureResult<T>(filename: string, index = 0): T {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, filename), 'utf-8')) as Open5ePage<T>
  return raw.results[index]
}

export function loadFixtureResults<T>(filename: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(FIXTURES_DIR, filename), 'utf-8')) as Open5ePage<T>
  return raw.results
}

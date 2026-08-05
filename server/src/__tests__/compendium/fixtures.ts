import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_PATH = resolve(__dirname, '../fixtures/compendium/samples.json')

// Real records captured from Complete_Compendium_5.5e.xml (see
// DevTools/Claude/phase-2.5.md) — not hand-written approximations.
const samples = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'))

export function compendiumFixture<T>(name: keyof typeof samples): T {
  return samples[name] as T
}

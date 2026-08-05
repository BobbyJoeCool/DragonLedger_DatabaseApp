import { XMLParser } from 'fast-xml-parser'
import type { CompendiumDocument } from './types.js'

// Elements that repeat and must always come through as arrays, even when a
// given record happens to have exactly one (fast-xml-parser otherwise
// collapses a single occurrence to a bare object). Verified against the
// real file, not guessed — see DevTools/Claude/phase-2.5.md.
const ARRAY_TAGS = new Set([
  'class',
  'race',
  'spell',
  'item',
  'feat',
  'background',
  'monster',
  'trait',
  'feature',
  'autolevel',
  'action',
  'legendary',
  'roll',
  'modifier',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ARRAY_TAGS.has(name),
  trimValues: true,
})

export function parseCompendiumXml(xml: string): CompendiumDocument {
  return parser.parse(xml) as CompendiumDocument
}

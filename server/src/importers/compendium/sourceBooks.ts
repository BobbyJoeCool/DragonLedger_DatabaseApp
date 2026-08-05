import { slugify } from '../../utils/slugify.js'

export const UNCREDITED_SOURCE_ID = 'fc5-compendium-uncredited'
const UNCREDITED_SOURCE_NAME = 'Compendium (Uncredited)'

// Real book titles confirmed present in the compendium file, mapped to
// their Open5e v2 document key — used ONLY for the duplicate-check
// cross-reference (a book with no entry here is presumed to have no
// Open5e equivalent, so no duplicate check runs at all for it). This is
// NOT used as the record's own sourceId — every cited book still gets its
// own per-book Compendium Source row, per the design doc's "Per-book
// Source rows" decision; Open5e and Compendium content for the "same"
// book stay in deliberately separate Source rows.
//
// Open5e's own document coverage turned out to be much narrower than the
// Compendium's ~140 distinct cited books — only the SRD core books and a
// handful of specific compilations (Tal'Dorei, Creature Codex) have a real
// Open5e equivalent at all. Everything else (Xanathar's, Tasha's, Eberron
// sourcebooks, Critical Role modules, all homebrew/third-party/UA content)
// has no Open5e mapping, which is expected, not a gap to fill in.
const COMPENDIUM_TO_OPEN5E_SOURCE: Record<string, string> = {
  "player's handbook (2024)": 'srd-2024',
  "player's handbook 2024": 'srd-2024',
  "dungeon master's guide (2024)": 'srd-2024',
  'monster manual (2024)': 'srd-2024',
  // Real citation data in the file uses "(2025)" for what is clearly the
  // 2024-cycle Monster Manual (likely a placeholder/typo upstream in the
  // compendium's own data) — mapped the same as the 2024 books rather than
  // treated as a genuinely distinct, unmapped source.
  'monster manual (2025)': 'srd-2024',
  "player's handbook (2014)": 'srd-2014',
  "dungeon master's guide (2014)": 'srd-2014',
  'monster manual (2014)': 'srd-2014',
  "tal'dorei campaign setting: reborn": 'tdcs',
  'creature codex (3pp)': 'ccdx',
  'creature codex': 'ccdx',
}

export interface ResolvedCompendiumSource {
  sourceId: string
  sourceName: string
  mappedOpen5eDocumentKey: string | null
}

export function resolveCompendiumSource(book: string | null): ResolvedCompendiumSource {
  if (!book) {
    return {
      sourceId: UNCREDITED_SOURCE_ID,
      sourceName: UNCREDITED_SOURCE_NAME,
      mappedOpen5eDocumentKey: null,
    }
  }

  const normalized = book.toLowerCase().trim()
  return {
    sourceId: `compendium-${slugify(book)}`,
    sourceName: book,
    mappedOpen5eDocumentKey: COMPENDIUM_TO_OPEN5E_SOURCE[normalized] ?? null,
  }
}

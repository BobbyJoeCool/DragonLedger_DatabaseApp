// Shared between the Open5e and Compendium Monster importers — a recurring
// 5e template ("bludgeoning, piercing, and slashing damage from nonmagical
// attacks that aren't silvered") gets recognized as one atomic entry rather
// than split on commas (which garbles the qualifier) or left as one opaque
// blob (which loses the fact that it's specifically three physical damage
// types).
//
// Phase 2.6: normalized to one unified shape written by both sources —
// `types`/`nonmagical`/`bypassedBy` are always present (never optional,
// never a bare string), decided in the schema-expansion design session so a
// downstream consumer (e.g. a character sheet computing whether a hit
// should be halved) never has to branch on which source a row came from.
// For Compendium this remains the only form the data takes at all
// (`<resist>`/`<immune>`/`<vulnerable>`/`<conditionImmune>` are plain free
// text); for Open5e it's applied to the API's `_display` string fields
// (falling back to a comma-joined reconstruction of the flat key array if
// `_display` is ever empty while the flat array isn't), not the
// already-split array, since the array silently discards the qualifier.
export interface CompositeResistanceEntry {
  types: string[]
  nonmagical: boolean
  bypassedBy: string | null
}

const DAMAGE_TYPE_WORDS = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
])

function splitList(text: string): string[] {
  return text
    .split(/,|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseOneClause(clause: string): CompositeResistanceEntry {
  const trimmed = clause.trim()
  const nonmagical = /nonmagical/i.test(trimmed)
  const bypassMatch =
    trimmed.match(/unless\s+(.+?)[.)]*$/i) ??
    trimmed.match(/that\s+aren['’]?t\s+(.+?)[.)]*$/i) ??
    trimmed.match(/\(([^)]+)\)\s*$/)
  const bypassedBy = bypassMatch ? bypassMatch[1].trim() : null

  const wordsOnly = trimmed
    .replace(/\([^)]*\)/g, '')
    .replace(/from\s+nonmagical\s+(attacks|weapons|sources)?/i, '')
    .replace(/unless.*/i, '')
    .replace(/that\s+aren['’]?t.*/i, '')
    .replace(/\bdamage\b/gi, '')
    .trim()

  const allWords = splitList(wordsOnly).map((w) => w.toLowerCase())
  const recognized = allWords.filter((w) => DAMAGE_TYPE_WORDS.has(w))

  // Recognized damage-type words found — use only those (drops incidental
  // filler words like a stray unrecognized token mixed into the same
  // clause). Covers both the qualified case (nonmagical/bypassedBy set) and
  // the plain multi-type list case ("cold, fire, lightning").
  if (recognized.length > 0) {
    return { types: recognized, nonmagical, bypassedBy }
  }

  // No recognized damage-type words at all — this is either a condition
  // name list (conditionImmunities reuses this same parser, and condition
  // names like "poisoned"/"exhaustion" were never in DAMAGE_TYPE_WORDS) or
  // genuinely unrecognized free text. Real, previously-shipped bug fixed
  // here: a multi-condition clause like "charmed, exhaustion, frightened"
  // used to collapse into one opaque string entry instead of three separate
  // condition names — using the already-split, lowercased word list instead
  // of the raw unsplit clause fixes that for both sources.
  if (allWords.length > 0) {
    return { types: allWords, nonmagical, bypassedBy }
  }

  // Last-resort fallback — should be unreachable given the `!text` guard in
  // parseCompositeResistanceList, kept only so this never throws.
  return { types: [trimmed.toLowerCase()], nonmagical, bypassedBy }
}

export function parseCompositeResistanceList(
  raw: string | null | undefined,
): CompositeResistanceEntry[] {
  if (!raw) return []
  const text = raw.trim()
  if (!text) return []

  return text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOneClause)
}

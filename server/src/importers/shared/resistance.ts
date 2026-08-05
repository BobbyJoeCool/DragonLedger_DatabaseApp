// Shared between the Open5e and Compendium Monster importers — a recurring
// 5e template ("bludgeoning, piercing, and slashing damage from nonmagical
// attacks that aren't silvered") gets recognized as one atomic entry rather
// than split on commas (which garbles the qualifier) or left as one opaque
// blob (which loses the fact that it's specifically three physical damage
// types). For the Compendium this is the only form the data takes at all
// (`<resist>`/`<immune>`/`<vulnerable>`/`<conditionImmune>` are plain free
// text); for Open5e it applies to the `_display` string, not the
// already-split array, since the array silently discards the qualifier.
export interface CompositeResistanceEntry {
  type?: string
  types?: string[]
  nonmagical?: boolean
  bypassedBy?: string | null
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

  const candidates = splitList(wordsOnly)
    .map((w) => w.toLowerCase())
    .filter((w) => DAMAGE_TYPE_WORDS.has(w))

  if (candidates.length > 1) {
    return {
      types: candidates,
      nonmagical: nonmagical || undefined,
      bypassedBy: bypassedBy ?? undefined,
    }
  }
  if (candidates.length === 1 && !nonmagical && !bypassedBy) {
    return { type: candidates[0] }
  }
  if (candidates.length === 1) {
    return {
      types: candidates,
      nonmagical: nonmagical || undefined,
      bypassedBy: bypassedBy ?? undefined,
    }
  }
  // Couldn't find recognized damage-type words at all (e.g. a bare
  // condition name, or free text the template doesn't cover) — best-effort
  // fallback that still preserves the clause rather than dropping it.
  return { type: trimmed.toLowerCase() }
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

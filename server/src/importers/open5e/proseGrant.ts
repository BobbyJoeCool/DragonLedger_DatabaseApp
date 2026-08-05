// Shared prose parsing for the "Choose N: A, B, or C" / "A and B" / "None"
// patterns that show up identically across Classes' CORE_TRAITS_TABLE rows
// and Backgrounds' benefit descriptions — both are free text with no
// dedicated structured field, and both use the same phrasing conventions.

export function splitOptionList(text: string): string[] {
  return text
    .split(/,|\band\b|\bor\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }

function wordToNumber(word: string): number {
  if (/^\d+$/.test(word)) return Number(word)
  return COUNT_WORDS[word.toLowerCase()] ?? 1
}

export interface ProficiencyGrant {
  fixed: string[]
  choices: Array<{ type: 'select'; count: number; from: string[] | null; amount: null }>
}

export function parseProficiencyGrant(value: string): ProficiencyGrant {
  if (value.trim().toLowerCase() === 'none') {
    return { fixed: [], choices: [] }
  }
  const chooseMatch = value.match(/^Choose\s+(\w+)\s*(?:kind of|type of)?\s*:?\s*(.*)$/i)
  if (chooseMatch) {
    const count = wordToNumber(chooseMatch[1])
    const rest = chooseMatch[2].trim()
    const from = rest.length > 0 ? splitOptionList(rest) : null
    return { fixed: [], choices: [{ type: 'select', count, from, amount: null }] }
  }
  return { fixed: splitOptionList(value), choices: [] }
}

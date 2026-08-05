// Citation format confirmed real and consistent across every content type
// checked: a trailing "Source:\t<Book Title> p. <page>" line at the end of
// the record's free-text field. Genuine multi-book citations (a second
// book after a comma) are real but rare — 12 of 8,033 citations checked
// (~0.15%), once trailing-comma noise ("...p. 150,") is filtered out from
// looking like a second, empty book. Per a deliberate scope decision, only
// the first-listed book is used for sourceId; the rest is preserved raw,
// never silently dropped.
export interface ParsedCitation {
  book: string | null
  page: string | null
  additionalCitations: string[]
  cleanedText: string
}

const CITATION_RE = /\n*Source:\s*\t?(.+)$/s

export function extractCitation(rawText: string | number): ParsedCitation {
  // fast-xml-parser coerces a purely-numeric element body (rare, but real
  // — a handful of records have a bare number where free text is normally
  // expected) to a number rather than a string.
  const text = String(rawText)
  const match = text.match(CITATION_RE)
  if (!match) {
    return { book: null, page: null, additionalCitations: [], cleanedText: text.trim() }
  }

  const cleanedText = text.slice(0, match.index).trim()
  const citationLine = match[1].trim().replace(/\s+/g, ' ').replace(/,\s*$/, '')
  const parts = citationLine
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const [first, ...rest] = parts

  if (!first) {
    return { book: null, page: null, additionalCitations: [], cleanedText }
  }

  const pageMatch = first.match(/^(.*?)\s*p\.?\s*(\d+)\s*$/i)
  const book = pageMatch ? pageMatch[1].trim() : first
  const page = pageMatch ? pageMatch[2] : null

  return { book, page, additionalCitations: rest, cleanedText }
}

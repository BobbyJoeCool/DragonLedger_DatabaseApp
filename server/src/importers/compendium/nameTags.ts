// Real data correction: the design doc anticipated just `[5.5e]` (edition)
// and `(HB)` (homebrew) as trailing name tags. Real data carries a much
// richer set — `(Legacy)` (2014-edition), `(TP)` (third-party), `(UA)`
// (Unearthed Arcana playtest) — plus arbitrary other bracketed qualifiers
// (publisher/campaign names like `(Zamanora)`, `(OWM)`, book titles like
// `(Book of Ebon Tides)`) that don't map to a known tag at all. See
// DevTools/Notes/v0.2.notes.md.
export interface ParsedNameTags {
  name: string
  edition: '2014' | '2024' | null
  homebrew: boolean
  thirdParty: boolean
  unearthedArcana: boolean
  otherTags: string[]
}

export function parseNameTags(rawName: string): ParsedNameTags {
  let name = rawName.trim()
  let edition: '2014' | '2024' | null = null
  let homebrew = false
  let thirdParty = false
  let unearthedArcana = false
  const otherTags: string[] = []

  // Repeatedly strip a trailing [..] or (..) group — these stack in any
  // order and any combination in real data (e.g. "Blood Hunter (Alt.
  // LaserLlama) [5.5e]", "Shadow Domain (Book of Ebon Tides) (TP) (Legacy)").
  for (;;) {
    const match = name.match(/[[(]([^[\]()]*)[\])]\s*$/)
    if (!match) break

    const tag = match[1].trim()
    if (/^5\.5e$/i.test(tag)) {
      edition = edition ?? '2024'
    } else if (/^HB$/i.test(tag)) {
      homebrew = true
    } else if (/^TP$/i.test(tag)) {
      thirdParty = true
    } else if (/^UA$/i.test(tag)) {
      unearthedArcana = true
    } else if (/^Legacy$/i.test(tag)) {
      edition = '2014'
    } else if (tag.length > 0) {
      otherTags.unshift(tag)
    }
    name = name.slice(0, match.index).trim()
  }

  return { name, edition, homebrew, thirdParty, unearthedArcana, otherTags }
}

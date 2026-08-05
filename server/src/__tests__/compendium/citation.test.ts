import { describe, expect, it } from 'vitest'
import { extractCitation } from '../../importers/compendium/citation.js'

describe('extractCitation', () => {
  it('extracts book and page from the real "Source:\\t<Book> p. <page>" format', () => {
    const result = extractCitation(
      "Some description text.\n\nSource:\tPlayer's Handbook (2024) p. 76",
    )
    expect(result.book).toBe("Player's Handbook (2024)")
    expect(result.page).toBe('76')
    expect(result.cleanedText).toBe('Some description text.')
    expect(result.additionalCitations).toEqual([])
  })

  it('returns no citation when the text has none', () => {
    const result = extractCitation('Just prose, no citation line.')
    expect(result.book).toBeNull()
    expect(result.cleanedText).toBe('Just prose, no citation line.')
  })

  it('does not treat a trailing comma after the page number as a second, empty book', () => {
    const result = extractCitation("Text.\n\nSource:\tXanathar's Guide to Everything p. 150,")
    expect(result.book).toBe("Xanathar's Guide to Everything")
    expect(result.additionalCitations).toEqual([])
  })

  it('captures a genuine second book in a multi-book citation without using it for sourceId', () => {
    const result = extractCitation(
      "Text.\n\nSource:\tEberron: Rising from the Last War p. 62, Tasha's Cauldron of Everything p. 21",
    )
    expect(result.book).toBe('Eberron: Rising from the Last War')
    expect(result.additionalCitations).toEqual(["Tasha's Cauldron of Everything p. 21"])
  })

  it('coerces a non-string element body rather than throwing (real fast-xml-parser quirk)', () => {
    const result = extractCitation(42)
    expect(result.cleanedText).toBe('42')
  })
})

import type { FixedChoiceGrant, GradeEntry, GrantChoice } from '@dragonledger/content-types'

// ---------------------------------------------------------------------------
// spellLevelSchoolLine — small formatting helper duplicated identically in
// SpellCard.tsx, the trading-card adapters, and the Monster+Spellcasting
// packet's appendix — promoted here once all three needed it.
// ---------------------------------------------------------------------------

const ORDINAL_SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (ORDINAL_SUFFIXES[n % 10] ?? 'th')
  return `${n}${suffix}`
}

export function spellLevelSchoolLine(level: number, school: string): string {
  const schoolName = school || 'unknown school'
  return level === 0 ? `${schoolName} cantrip` : `${ordinal(level)}-level ${schoolName}`
}

// ---------------------------------------------------------------------------
// grantShapeToText — §2. Renders the "Fixed/Choice Grant Shape" schema
// pattern ({fixed, choices:[{type:'select'|'distribute',...}]}) as display
// text. Proven across 3 real uses: Background proficiencies/abilityBonuses,
// Race (Drow's innate-spell trait), Class (skillChoices, Totem Spirit
// subclass feature's animal choice).
// ---------------------------------------------------------------------------

function gradeEntryToText(entry: GradeEntry): string {
  return typeof entry === 'string' ? entry : `${entry.name} (${entry.category})`
}

function choiceToText(choice: GrantChoice): string {
  if (choice.type === 'select') {
    const list = choice.from ? choice.from.map(gradeEntryToText).join(', ') : 'your choice'
    const amount = choice.amount != null ? ` (+${choice.amount} each)` : ''
    return `Choose ${choice.count}${amount} from: ${list}`
  }
  const among = choice.among.map(gradeEntryToText).join(', ')
  return `Distribute ${choice.pool} point${choice.pool === 1 ? '' : 's'} among ${among} (max ${choice.maxPerOption} per option)`
}

function fixedToText(fixed: GradeEntry[] | Record<string, number>): string {
  if (Array.isArray(fixed)) {
    return fixed.map(gradeEntryToText).join(', ')
  }
  const entries = Object.entries(fixed)
  return entries.map(([key, value]) => `${key} +${value}`).join(', ')
}

export function grantShapeToText<F extends GradeEntry[] | Record<string, number>>(
  shape: FixedChoiceGrant<F>,
): string {
  const fixedText = fixedToText(shape.fixed)
  const choiceTexts = shape.choices.map(choiceToText)
  return [fixedText, ...choiceTexts].filter((part) => part.length > 0).join('; ')
}

// ---------------------------------------------------------------------------
// parseFeatDescription — §2. Real ContentFeat rows (Compendium-sourced, the
// dominant source) fold each named sub-benefit into `description` as a
// tab-prefixed line rather than a structured array (the schema's
// `benefits[]` key is Open5e-only, not populated on Compendium rows).
// Splits `description` into {intro[], benefits:[{name, text}]}, splitting
// each tab-prefixed line at its first ". ".
// ---------------------------------------------------------------------------

export interface FeatBenefit {
  name: string
  text: string
}

export interface ParsedFeatDescription {
  intro: string[]
  benefits: FeatBenefit[]
}

export function parseFeatDescription(description: string): ParsedFeatDescription {
  const intro: string[] = []
  const benefits: FeatBenefit[] = []

  for (const rawLine of description.split('\n')) {
    if (rawLine.trim() === '') continue

    if (rawLine.startsWith('\t')) {
      const content = rawLine.slice(1)
      const splitIndex = content.indexOf('. ')
      if (splitIndex === -1) {
        benefits.push({ name: content.trim(), text: '' })
      } else {
        benefits.push({
          name: content.slice(0, splitIndex).trim(),
          text: content.slice(splitIndex + 2).trim(),
        })
      }
    } else {
      intro.push(rawLine.trim())
    }
  }

  return { intro, benefits }
}

// ---------------------------------------------------------------------------
// parseDescriptionBlocks / splitSentences / segment-pagination trio — §2.
// General-purpose (not spell-specific) list detection: numbered (1./1)) or
// bulleted (-/*/•) consecutive lines in any description render as real
// ordered/unordered lists. Feeds the Trading Card greedy pagination system,
// which fills a card with as much content as fits, spills overflow to a
// "(cont.)" card, and resumes list numbering correctly if a list splits
// across cards.
// ---------------------------------------------------------------------------

export type DescriptionBlock =
  | { type: 'paragraph'; text: string; atomic?: boolean }
  | { type: 'list'; ordered: boolean; items: string[]; start: number }

const NUMBERED_RE = /^(\d+)[.)]\s+(.*)$/
const BULLETED_RE = /^[-*•]\s+(.*)$/

export function parseDescriptionBlocks(text: string): DescriptionBlock[] {
  const lines = text.split('\n')
  const blocks: DescriptionBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === '') {
      i++
      continue
    }

    const numberedMatch = NUMBERED_RE.exec(line)
    if (numberedMatch) {
      const start = Number.parseInt(numberedMatch[1], 10)
      const items: string[] = []
      let expected = start
      while (i < lines.length) {
        const m = NUMBERED_RE.exec(lines[i].trim())
        if (!m || Number.parseInt(m[1], 10) !== expected) break
        items.push(m[2])
        expected++
        i++
      }
      blocks.push({ type: 'list', ordered: true, items, start })
      continue
    }

    const bulletedMatch = BULLETED_RE.exec(line)
    if (bulletedMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const m = BULLETED_RE.exec(lines[i].trim())
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ type: 'list', ordered: false, items, start: 1 })
      continue
    }

    const paraLines = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !NUMBERED_RE.test(lines[i].trim()) &&
      !BULLETED_RE.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
  }

  return blocks
}

// Good-enough heuristic sentence splitter for D&D rules prose, not a full
// NLP sentence splitter — avoids breaking on the common abbreviations that
// actually show up in this content (ft., no., e.g., i.e., vs., etc.).
const ABBREVIATION_RE = /\b(ft|no|vs|etc|e\.g|i\.e|dc|hp|ac)\.$/i

export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const rawParts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
  const merged: string[] = []

  for (const part of rawParts) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && ABBREVIATION_RE.test(prev)) {
      merged[merged.length - 1] = `${prev} ${part}`
    } else {
      merged.push(part)
    }
  }

  return merged
}

function blockText(block: DescriptionBlock): string {
  return block.type === 'paragraph' ? block.text : block.items.join(' ')
}

export interface HigherLevelsBlock {
  heading: string
  text: string
}

export interface BuildSegmentsOptions {
  /** "At Higher Levels" (or equivalent) — bonded atomically to its first sentence, never split apart. */
  higherLevels?: HigherLevelsBlock
  /** Defaults to text length. A real trading-card renderer should pass a DOM-measured height instead. */
  measure?: (text: string) => number
}

/**
 * Greedily packs blocks onto cards under `capacity` (in whatever unit
 * `measure` returns). Paragraphs split at sentence boundaries when they
 * don't fit whole; lists split at item boundaries and the continuation
 * chunk's `start` resumes numbering correctly. A block that still doesn't
 * fit alone on an empty card is placed anyway (never silently dropped) —
 * mirrors useFitToPage's own "accept slight overflow rather than clip
 * data" philosophy.
 */
export function buildSegments(
  blocks: DescriptionBlock[],
  capacity: number,
  options: BuildSegmentsOptions = {},
): DescriptionBlock[][] {
  const measure = options.measure ?? ((s: string) => s.length)
  const allBlocks: DescriptionBlock[] = [...blocks]

  if (options.higherLevels) {
    const sentences = splitSentences(options.higherLevels.text)
    const [first, ...rest] = sentences
    const bonded = `${options.higherLevels.heading} ${first ?? ''}`.trim()
    // atomic: true — this heading+first-sentence unit is never split by the
    // paragraph sentence-splitting logic below, even if it overflows a card.
    allBlocks.push({ type: 'paragraph', text: bonded, atomic: true })
    if (rest.length > 0) allBlocks.push({ type: 'paragraph', text: rest.join(' ') })
  }

  const segments: DescriptionBlock[][] = []
  let current: DescriptionBlock[] = []
  let currentSize = 0

  const flush = () => {
    if (current.length > 0) segments.push(current)
    current = []
    currentSize = 0
  }

  for (const block of allBlocks) {
    const wholeSize = measure(blockText(block))

    if (currentSize + wholeSize <= capacity) {
      current.push(block)
      currentSize += wholeSize
      continue
    }

    // An atomic block (the bonded heading+first-sentence unit) is placed
    // wholesale on the next card, never split by sentence — accepted to
    // overflow the card rather than being torn apart.
    if (block.type === 'paragraph' && block.atomic) {
      if (current.length > 0) flush()
      current.push(block)
      currentSize = wholeSize
      continue
    }

    if (current.length > 0) {
      flush()
      if (wholeSize <= capacity) {
        current.push(block)
        currentSize += wholeSize
        continue
      }
    }

    if (block.type === 'paragraph') {
      let remaining = splitSentences(block.text)
      while (remaining.length > 0) {
        let fitCount = 0
        let acc = ''
        for (let n = 1; n <= remaining.length; n++) {
          const candidate = remaining.slice(0, n).join(' ')
          if (currentSize + measure(candidate) <= capacity || (current.length === 0 && n === 1)) {
            fitCount = n
            acc = candidate
          } else break
        }
        if (fitCount === 0) {
          flush()
          continue
        }
        current.push({ type: 'paragraph', text: acc })
        currentSize += measure(acc)
        remaining = remaining.slice(fitCount)
        if (remaining.length > 0) flush()
      }
      continue
    }

    let items = block.items
    let start = block.start
    while (items.length > 0) {
      let fitCount = 0
      for (let n = 1; n <= items.length; n++) {
        const candidateSize = measure(items.slice(0, n).join(' '))
        if (currentSize + candidateSize <= capacity || (current.length === 0 && n === 1)) {
          fitCount = n
        } else break
      }
      if (fitCount === 0) {
        flush()
        continue
      }
      const chunk = items.slice(0, fitCount)
      current.push({ type: 'list', ordered: block.ordered, items: chunk, start })
      currentSize += measure(chunk.join(' '))
      items = items.slice(fitCount)
      start += fitCount
      if (items.length > 0) flush()
    }
  }

  flush()
  return segments
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Serializes each card's block list to a plain HTML fragment string. */
export function segmentsToHTML(segments: DescriptionBlock[][]): string[] {
  return segments.map((segment) =>
    segment
      .map((block) => {
        if (block.type === 'paragraph') return `<p>${escapeHtml(block.text)}</p>`
        const tag = block.ordered ? 'ol' : 'ul'
        const startAttr = block.ordered && block.start !== 1 ? ` start="${block.start}"` : ''
        const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        return `<${tag}${startAttr}>${items}</${tag}>`
      })
      .join(''),
  )
}

// ---------------------------------------------------------------------------
// groupFeatures — §2. ContentClassFeature is a real relation table, one row
// per level (not grouped) — recurring features like Ability Score
// Improvement appear as one row per level they occur on. Groups rows back
// together by name+description for display, collecting levels:[]. Reused
// identically for both class-level and subclass-level rows (promoted here
// from the ad hoc `groupFeaturesSimple` duplicated in ClassCard.tsx and
// SubclassCard.tsx — those call sites switch to this shared version when
// the Phase 8 per-type card rebuild happens).
// ---------------------------------------------------------------------------

export interface ClassFeatureRow {
  id: string
  level: number
  name: string
  description: string
  type?: string | null
}

export interface GroupedClassFeature {
  name: string
  description: string
  levels: number[]
}

export function groupFeatures(rows: ClassFeatureRow[]): GroupedClassFeature[] {
  const groups = new Map<string, GroupedClassFeature>()

  for (const row of rows) {
    const key = `${row.name} ${row.description}`
    const existing = groups.get(key)
    if (existing) {
      existing.levels.push(row.level)
    } else {
      groups.set(key, { name: row.name, description: row.description, levels: [row.level] })
    }
  }

  return [...groups.values()]
}

// ---------------------------------------------------------------------------
// spellFooterFromExtraData — §4 dependency 3. Only renders "Damage" if
// damageRoll AND damageTypes[] are both present, "Save" if savingThrow is
// present, "Area" if shapeType AND shapeSize are both present. Exists
// because extraData carries leftover keys even on non-damage spells (e.g.
// Guidance has a stray damageRoll despite being a pure buff) — a naive
// "show the key if it exists" binding would produce a wrong footer.
// ---------------------------------------------------------------------------

export interface SpellFooter {
  damage?: { roll: string; types: string[] }
  save?: string
  area?: { shapeType: string; shapeSize: number; shapeSizeUnit?: string }
}

export function spellFooterFromExtraData(
  extraData: Record<string, unknown> | null | undefined,
): SpellFooter {
  if (!extraData) return {}

  const footer: SpellFooter = {}

  const { damageRoll, damageTypes, savingThrow, shapeType, shapeSize, shapeSizeUnit } = extraData

  if (typeof damageRoll === 'string' && Array.isArray(damageTypes) && damageTypes.length > 0) {
    footer.damage = { roll: damageRoll, types: damageTypes as string[] }
  }

  if (typeof savingThrow === 'string' && savingThrow.length > 0) {
    footer.save = savingThrow
  }

  if (typeof shapeType === 'string' && typeof shapeSize === 'number') {
    footer.area = {
      shapeType,
      shapeSize,
      shapeSizeUnit: typeof shapeSizeUnit === 'string' ? shapeSizeUnit : undefined,
    }
  }

  return footer
}

// ---------------------------------------------------------------------------
// suppressEdgeDividers — §1.3. Ported from the demo phase's own approach:
// for each non-spanning minor divider inside a multi-column container,
// hide it (visibility, not display, so no reflow) if it lands essentially
// at the top or bottom edge of its own column — a redundant line right
// where the column break itself already reads as the separator.
//
// This is a heuristic port, not a byte-for-byte copy of the original demo
// (which had access to the exact multi-column containers it was built
// against) — it needs a real visual check against actual card layouts once
// the per-type cards that use multi-column sections (Monster) are wired up
// (§6 item 8 of the handoff doc calls this out explicitly as one of the
// two "easy to reintroduce" bugs from the demo phase).
// ---------------------------------------------------------------------------

const EDGE_EPSILON_PX = 4

export function suppressEdgeDividers(container: HTMLElement): void {
  const dividers = container.querySelectorAll<HTMLElement>(
    '.dl-divider.dl-divider-minor:not(.dl-divider-span)',
  )
  if (dividers.length === 0) return

  const containerRect = container.getBoundingClientRect()
  const computed = getComputedStyle(container)
  const columnCount = Number.parseInt(computed.columnCount, 10) || 1
  const columnHeight = containerRect.height / columnCount

  for (const divider of dividers) {
    const rect = divider.getBoundingClientRect()
    const offsetInContainer = rect.top - containerRect.top
    const offsetWithinColumn = offsetInContainer % columnHeight

    const nearColumnTop = offsetWithinColumn <= EDGE_EPSILON_PX
    const nearColumnBottom = columnHeight - offsetWithinColumn - rect.height <= EDGE_EPSILON_PX

    divider.style.visibility = nearColumnTop || nearColumnBottom ? 'hidden' : ''
  }
}

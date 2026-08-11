import { describe, expect, it } from 'vitest'
import {
  buildSegments,
  grantShapeToText,
  groupFeatures,
  parseDescriptionBlocks,
  parseFeatDescription,
  segmentsToHTML,
  splitSentences,
  spellFooterFromExtraData,
  type ClassFeatureRow,
} from './utils'

// Real rows quoted below (grantShapeToText, parseFeatDescription,
// groupFeatures, spellFooterFromExtraData) come straight from the live
// dev.db, per the handoff doc's instruction to test against real content
// rather than synthetic fixtures — see Documentation/phase-8-card-theming-
// final-export.md §6 item 2.

describe('grantShapeToText', () => {
  it('renders a name-only fixed grant with no choices (Acolyte proficiencies)', () => {
    const shape = {
      fixed: [
        { name: 'Insight', category: 'skill' },
        { name: 'Religion', category: 'skill' },
        { name: "Calligrapher's Supplies", category: 'tool' },
      ],
      choices: [],
    }
    expect(grantShapeToText(shape)).toBe(
      "Insight (skill), Religion (skill), Calligrapher's Supplies (tool)",
    )
  })

  it('renders an empty fixed ability-bonus grant with a distribute choice (Acolyte abilityBonuses)', () => {
    const shape = {
      fixed: {},
      choices: [{ type: 'distribute' as const, pool: 3, among: ['INT', 'WIS', 'CHA'], maxPerOption: 2 }],
    }
    expect(grantShapeToText(shape)).toBe('Distribute 3 points among INT, WIS, CHA (max 2 per option)')
  })

  it('renders an empty fixed list with a select choice (Barbarian skillChoices)', () => {
    const shape = {
      fixed: [],
      choices: [
        {
          type: 'select' as const,
          count: 2,
          from: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
          amount: null,
        },
      ],
    }
    expect(grantShapeToText(shape)).toBe(
      'Choose 2 from: Animal Handling, Athletics, Intimidation, Nature, Perception, Survival',
    )
  })

  it('renders a fixed ability-bonus record directly (no choices)', () => {
    const shape = { fixed: { STR: 2, CON: 1 }, choices: [] }
    expect(grantShapeToText(shape)).toBe('STR +2, CON +1')
  })
})

describe('parseFeatDescription', () => {
  it("splits Alert's real description into intro + named benefits", () => {
    const description = [
      'You gain the following benefits.',
      '',
      "\tInitiative Proficiency. When you roll Initiative, you can add your Proficiency Bonus to the roll.",
      '',
      "\tInitiative Swap. Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition.",
    ].join('\n')

    const result = parseFeatDescription(description)

    expect(result.intro).toEqual(['You gain the following benefits.'])
    expect(result.benefits).toEqual([
      {
        name: 'Initiative Proficiency',
        text: 'When you roll Initiative, you can add your Proficiency Bonus to the roll.',
      },
      {
        name: 'Initiative Swap',
        text:
          "Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition.",
      },
    ])
  })

  it('treats a feat with no tab-prefixed lines as pure intro, no benefits', () => {
    const result = parseFeatDescription('You gain proficiency in the Arcana skill.')
    expect(result.intro).toEqual(['You gain proficiency in the Arcana skill.'])
    expect(result.benefits).toEqual([])
  })
})

describe('groupFeatures', () => {
  // Real ContentClassFeature rows for Barbarian (live dev.db): Ability
  // Score Improvement recurs identically at levels 4/8/12/16 — the exact
  // "recurring feature, one row per level" case this utility exists for.
  const asiDescription =
    'You gain the Ability Score Improvement feat (see "Feats") or another feat of your choice for which you qualify. You gain this feature again at Barbarian levels 8, 12, and 16.'

  const rows: ClassFeatureRow[] = [
    { id: 'a4', level: 4, name: 'Ability Score Improvement', description: asiDescription },
    { id: 'a8', level: 8, name: 'Ability Score Improvement', description: asiDescription },
    { id: 'a12', level: 12, name: 'Ability Score Improvement', description: asiDescription },
    { id: 'a16', level: 16, name: 'Ability Score Improvement', description: asiDescription },
    {
      id: 'r1',
      level: 1,
      name: 'Unarmored Defense',
      description:
        "While you aren't wearing any armor, your base Armor Class equals 10 plus your Dexterity and Constitution modifiers. You can use a Shield and still gain this benefit.",
    },
  ]

  it('collapses recurring same name+description rows into one entry with all levels', () => {
    const grouped = groupFeatures(rows)
    expect(grouped).toHaveLength(2)

    const asi = grouped.find((f) => f.name === 'Ability Score Improvement')
    expect(asi?.levels).toEqual([4, 8, 12, 16])

    const unarmored = grouped.find((f) => f.name === 'Unarmored Defense')
    expect(unarmored?.levels).toEqual([1])
  })

  it('keeps two same-named features with different descriptions as separate groups', () => {
    const grouped = groupFeatures([
      { id: '1', level: 3, name: 'Metamagic', description: 'First option.' },
      { id: '2', level: 3, name: 'Metamagic', description: 'Second option.' },
    ])
    expect(grouped).toHaveLength(2)
  })
})

describe('spellFooterFromExtraData', () => {
  it('shows damage, save, and area for Fireball (all three present)', () => {
    const footer = spellFooterFromExtraData({
      damageRoll: '8d6',
      damageTypes: ['fire'],
      savingThrow: 'dexterity',
      targetType: 'creature',
      targetCount: 1,
      shapeType: 'sphere',
      shapeSize: 20,
      shapeSizeUnit: 'feet',
    })
    expect(footer).toEqual({
      damage: { roll: '8d6', types: ['fire'] },
      save: 'dexterity',
      area: { shapeType: 'sphere', shapeSize: 20, shapeSizeUnit: 'feet' },
    })
  })

  it('hides damage and area for Guidance despite a stray damageRoll/shapeSizeUnit', () => {
    // Real extraData: {"damageRoll":"1d4","targetType":"creature","targetCount":1,"shapeSizeUnit":"feet"}
    // damageTypes is absent (no damage), and shapeType/shapeSize are both
    // absent (no area) — this is the exact case the function exists for.
    const footer = spellFooterFromExtraData({
      damageRoll: '1d4',
      targetType: 'creature',
      targetCount: 1,
      shapeSizeUnit: 'feet',
    })
    expect(footer).toEqual({})
  })

  it('shows all three for Prismatic Spray (multi-type damage)', () => {
    const footer = spellFooterFromExtraData({
      damageRoll: '1d8',
      damageTypes: ['lightning', 'fire', 'poison', 'acid', 'cold'],
      savingThrow: 'dexterity',
      targetType: 'creature',
      targetCount: 1,
      shapeType: 'cone',
      shapeSize: 60,
      shapeSizeUnit: 'feet',
    })
    expect(footer.damage).toEqual({ roll: '1d8', types: ['lightning', 'fire', 'poison', 'acid', 'cold'] })
    expect(footer.save).toBe('dexterity')
    expect(footer.area).toEqual({ shapeType: 'cone', shapeSize: 60, shapeSizeUnit: 'feet' })
  })

  it('returns an empty footer for null/undefined extraData', () => {
    expect(spellFooterFromExtraData(null)).toEqual({})
    expect(spellFooterFromExtraData(undefined)).toEqual({})
  })
})

describe('parseDescriptionBlocks', () => {
  it('detects a real bulleted list embedded in Barbarian Rage\'s description', () => {
    // Real ContentClassFeature row (Barbarian, level 1, "Rage") — the
    // "Duration" paragraph ends in a genuine "-"-bulleted list.
    const text =
      "Each time the Rage is extended, it lasts until the end of your next turn.\n" +
      '- Make an attack roll against an enemy.\n' +
      '- Force an enemy to make a saving throw.\n' +
      '- Take a Bonus Action to extend your Rage.'

    const blocks = parseDescriptionBlocks(text)
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      text: 'Each time the Rage is extended, it lasts until the end of your next turn.',
    })
    expect(blocks[1]).toEqual({
      type: 'list',
      ordered: false,
      start: 1,
      items: [
        'Make an attack roll against an enemy.',
        'Force an enemy to make a saving throw.',
        'Take a Bonus Action to extend your Rage.',
      ],
    })
  })

  it('detects a numbered list and preserves its start number', () => {
    const blocks = parseDescriptionBlocks('3. Third\n4. Fourth\n5. Fifth')
    expect(blocks).toEqual([{ type: 'list', ordered: true, start: 3, items: ['Third', 'Fourth', 'Fifth'] }])
  })

  it('treats a non-consecutive number as breaking the list', () => {
    const blocks = parseDescriptionBlocks('1. First\n1. Also first (not a continuation)')
    expect(blocks).toEqual([
      { type: 'list', ordered: true, start: 1, items: ['First'] },
      { type: 'list', ordered: true, start: 1, items: ['Also first (not a continuation)'] },
    ])
  })
})

describe('splitSentences', () => {
  it('splits on sentence boundaries', () => {
    expect(splitSentences('First sentence. Second sentence! Third?')).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third?',
    ])
  })

  it('does not split on a "ft." abbreviation mid-sentence', () => {
    expect(splitSentences('The cone is 60 ft. long and hits everyone inside.')).toEqual([
      'The cone is 60 ft. long and hits everyone inside.',
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('buildSegments / segmentsToHTML', () => {
  it('keeps everything on one card when it all fits under capacity', () => {
    const blocks = parseDescriptionBlocks('A short description.')
    const segments = buildSegments(blocks, 1000)
    expect(segments).toHaveLength(1)
  })

  it('spills a paragraph across cards at sentence boundaries when it does not fit', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here.'
    const blocks = parseDescriptionBlocks(text)
    // Capacity sized so only ~1 sentence fits per card.
    const segments = buildSegments(blocks, 25)
    expect(segments.length).toBeGreaterThan(1)
    // No sentence should be dropped: rejoining every segment's text recovers all 3.
    const allText = segments.flat().map((b) => (b.type === 'paragraph' ? b.text : '')).join(' ')
    expect(allText).toContain('First sentence here.')
    expect(allText).toContain('Second sentence here.')
    expect(allText).toContain('Third sentence here.')
  })

  it('splits a list across cards and resumes numbering via start', () => {
    const blocks = parseDescriptionBlocks('1. One\n2. Two\n3. Three\n4. Four')
    const segments = buildSegments(blocks, 8) // forces item-by-item splitting
    const listBlocks = segments.flat().filter((b) => b.type === 'list')
    expect(listBlocks.length).toBeGreaterThan(1)
    // starts should be non-decreasing and the first one should be 1
    expect(listBlocks[0].start).toBe(1)
    for (let i = 1; i < listBlocks.length; i++) {
      expect(listBlocks[i].start).toBeGreaterThan(listBlocks[i - 1].start)
    }
  })

  it('bonds an "At Higher Levels" heading to its first sentence on the same card, never split apart', () => {
    const blocks = parseDescriptionBlocks('Intro text.')
    const segments = buildSegments(blocks, 15, {
      higherLevels: {
        heading: 'At Higher Levels.',
        text: 'The damage increases by 1d6. It also affects a wider area.',
      },
    })
    const bondedSegment = segments.find((seg) =>
      seg.some((b) => b.type === 'paragraph' && b.text.startsWith('At Higher Levels.')),
    )
    expect(bondedSegment).toBeDefined()
    const bondedBlock = bondedSegment!.find(
      (b) => b.type === 'paragraph' && b.text.startsWith('At Higher Levels.'),
    )
    expect((bondedBlock as { text: string }).text).toBe('At Higher Levels. The damage increases by 1d6.')
  })

  it('segmentsToHTML renders paragraphs and lists with a start attribute when resumed', () => {
    const segments: ReturnType<typeof parseDescriptionBlocks>[] = [
      [{ type: 'paragraph', text: 'Hello.' }],
      [{ type: 'list', ordered: true, start: 3, items: ['Three', 'Four'] }],
    ]
    const html = segmentsToHTML(segments)
    expect(html[0]).toBe('<p>Hello.</p>')
    expect(html[1]).toBe('<ol start="3"><li>Three</li><li>Four</li></ol>')
  })
})

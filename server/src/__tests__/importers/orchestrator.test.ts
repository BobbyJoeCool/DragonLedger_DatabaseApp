import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../db/client.js'
import { importSource } from '../../importers/orchestrator.js'
import { writeLog } from '../setup.js'

const SOURCE_ID = 'test-orchestrator-source'

function mockFetchRouter(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), { status: 200 })
      }
    }
    return new Response(JSON.stringify({ results: [], next: null }), { status: 200 })
  })
}

async function createJob(): Promise<string> {
  // ImportJob.sourceId is a required FK — matches the ordering
  // routes/import.ts uses for a brand-new source.
  await prisma.source.upsert({
    where: { id: SOURCE_ID },
    update: {},
    create: {
      id: SOURCE_ID,
      name: 'Test Source',
      type: 'API',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })
  const job = await prisma.importJob.create({
    data: {
      sourceId: SOURCE_ID,
      jobType: 'OPEN5E',
      contentTypes: JSON.stringify(['CONDITION', 'SPELL']),
    },
  })
  return job.id
}

const validCondition = {
  key: 'test_condition_a',
  name: 'Test Condition A',
  document: { key: 'test-doc', name: 'Test Doc' },
  icon: null,
  descriptions: [{ desc: 'Description A', document: 'test-doc', gamesystem: '5e-2024' }],
}

function spellFixture(name: string) {
  return {
    key: `test-doc_${name.toLowerCase()}`,
    name,
    level: 1,
    school: { key: 'evocation', name: 'Evocation' },
    casting_time: 'action',
    range_text: '30 feet',
    duration: 'instantaneous',
    concentration: false,
    ritual: false,
    desc: `${name} description`,
    higher_level: null,
    verbal: true,
    somatic: false,
    material: false,
    material_specified: null,
    classes: [{ key: 'test-doc_wizard', name: 'Wizard' }],
    document: { key: 'test-doc', name: 'Test Doc' },
    casting_options: [],
    damage_roll: null,
    damage_types: [],
    saving_throw_ability: null,
    attack_roll: false,
    target_type: null,
    target_count: null,
    shape_type: null,
    shape_size: null,
    shape_size_unit: null,
    reaction_condition: null,
    material_cost: null,
    material_consumed: false,
  }
}

function classFixture() {
  return {
    key: 'test-doc_test-class',
    name: 'Test Class',
    desc: 'A test class.',
    document: { key: 'test-doc', name: 'Test Doc' },
    hit_dice: 'd8',
    hit_points: null,
    primary_abilities: [],
    saving_throws: [],
    caster_type: 'NONE',
    subclass_of: null,
    features: [
      {
        key: 'test-doc_recurring-feature',
        name: 'Recurring Feature',
        desc: 'Grows stronger.',
        feature_type: 'CLASS_LEVEL_FEATURE',
        gained_at: [
          { level: 4, detail: null },
          { level: 8, detail: null },
        ],
        data_for_class_table: [],
      },
    ],
  }
}

describe('importSource orchestrator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    await prisma.contentClassFeature.deleteMany({
      where: { OR: [{ class: { sourceId: SOURCE_ID } }, { subclass: { sourceId: SOURCE_ID } }] },
    })
    await prisma.contentClass.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentSpell.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentCondition.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.importJob.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.source.deleteMany({ where: { id: SOURCE_ID } })
    writeLog('orchestrator: suite done')
  })

  it("explodes a grouped gained_at feature into one ContentClassFeature row per level, FK'd to the real inserted class (Phase 2.6)", async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/classes/': { results: [classFixture()], next: null },
      }),
    )

    const jobId = await createJob()
    await importSource({
      sourceId: SOURCE_ID,
      sourceName: 'Test Source',
      edition: '5.5e',
      contentTypes: ['CLASS'],
      jobId,
    })

    const cls = await prisma.contentClass.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, name: 'Test Class' },
    })
    const features = await prisma.contentClassFeature.findMany({ where: { classId: cls.id } })
    expect(features).toHaveLength(2)
    expect(features.map((f) => f.level).sort()).toEqual([4, 8])
    expect(features.every((f) => f.name === 'Recurring Feature')).toBe(true)
    expect(features.every((f) => f.subclassId === null)).toBe(true)

    writeLog(
      'orchestrator: CLASS import explodes gained_at into per-level ContentClassFeature rows [PASS]',
    )
  })

  it('imports fresh data and marks the job COMPLETED', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/conditions/': { results: [validCondition], next: null },
        '/spells/': { results: [spellFixture('Alpha')], next: null },
      }),
    )

    const jobId = await createJob()
    await importSource({
      sourceId: SOURCE_ID,
      sourceName: 'Test Source',
      edition: '5.5e',
      contentTypes: ['CONDITION', 'SPELL'],
      jobId,
    })

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(job.status).toBe('COMPLETED')

    const conditions = await prisma.contentCondition.findMany({ where: { sourceId: SOURCE_ID } })
    const spells = await prisma.contentSpell.findMany({ where: { sourceId: SOURCE_ID } })
    expect(conditions).toHaveLength(1)
    expect(spells).toHaveLength(1)
    expect(spells[0].name).toBe('Alpha')

    writeLog(
      `orchestrator: fresh import → ${conditions.length} conditions, ${spells.length} spells [PASS]`,
    )
  })

  it('replaces existing data on re-import instead of duplicating it', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/conditions/': { results: [validCondition], next: null },
        '/spells/': { results: [spellFixture('Beta'), spellFixture('Gamma')], next: null },
      }),
    )

    const jobId = await createJob()
    await importSource({
      sourceId: SOURCE_ID,
      sourceName: 'Test Source',
      edition: '5.5e',
      contentTypes: ['CONDITION', 'SPELL'],
      jobId,
    })

    const spells = await prisma.contentSpell.findMany({ where: { sourceId: SOURCE_ID } })
    expect(spells).toHaveLength(2)
    expect(spells.map((s) => s.name).sort()).toEqual(['Beta', 'Gamma'])

    writeLog(`orchestrator: re-import replaced → ${spells.length} spells (Beta, Gamma) [PASS]`)
  })

  it('rolls back only the failing content type, leaving prior data for it untouched, while other types still succeed', async () => {
    const malformedSpell = { key: 'broken', name: 'Broken Spell' } // missing `document` — throws inside transformSpell
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/conditions/': {
          results: [{ ...validCondition, name: 'Test Condition A Updated' }],
          next: null,
        },
        '/spells/': { results: [malformedSpell], next: null },
      }),
    )

    const beforeSpells = await prisma.contentSpell.findMany({ where: { sourceId: SOURCE_ID } })
    expect(beforeSpells).toHaveLength(2) // from the previous test — the baseline this run must not disturb

    const jobId = await createJob()
    await importSource({
      sourceId: SOURCE_ID,
      sourceName: 'Test Source',
      edition: '5.5e',
      contentTypes: ['CONDITION', 'SPELL'],
      jobId,
    })

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(job.status).toBe('PARTIAL')
    expect(job.errorLog).toContain('SPELL')

    const conditions = await prisma.contentCondition.findMany({ where: { sourceId: SOURCE_ID } })
    expect(conditions[0].name).toBe('Test Condition A Updated') // CONDITION still succeeded

    const afterSpells = await prisma.contentSpell.findMany({ where: { sourceId: SOURCE_ID } })
    expect(afterSpells.map((s) => s.name).sort()).toEqual(['Beta', 'Gamma']) // SPELL untouched, not wiped

    writeLog('orchestrator: partial failure isolates the broken type, others complete [PASS]')
  })
})

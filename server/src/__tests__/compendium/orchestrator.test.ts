import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../db/client.js'
import { importCompendium } from '../../importers/compendiumOrchestrator.js'
import { writeLog } from '../setup.js'

const API_SOURCE_ID = 'test-orch-open5e-source'
const TEST_BOOK = "Player's Handbook (2024)"
const COMPENDIUM_SOURCE_ID = 'compendium-player-s-handbook-2024'

function xmlWith(feats: string, spells: string): string {
  return `<?xml version="1.0"?>
<compendium version="5" auto_indent="NO">
${feats}
${spells}
</compendium>`
}

function featXml(name: string): string {
  return `<feat>
  <name>${name}</name>
  <text>Some feat text.

Source:\t${TEST_BOOK} p. 1</text>
</feat>`
}

function spellXml(name: string, level: number): string {
  return `<spell>
  <name>${name} [5.5e]</name>
  <level>${level}</level>
  <school>EV</school>
  <time>Action</time>
  <range>30 feet</range>
  <components>V, S</components>
  <duration>Instantaneous</duration>
  <text>Some spell text.

Source:\t${TEST_BOOK} p. 2</text>
</spell>`
}

const tmpDir = mkdtempSync(join(tmpdir(), 'compendium-orch-test-'))

async function seedOpen5eFixture(): Promise<void> {
  await prisma.source.upsert({
    where: { id: API_SOURCE_ID },
    update: {},
    create: {
      id: API_SOURCE_ID,
      name: 'Test Open5e Source',
      type: 'API',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })
  await prisma.contentSpell.upsert({
    where: { sourceId_slug: { sourceId: API_SOURCE_ID, slug: 'existing-spell' } },
    update: {},
    create: {
      sourceId: API_SOURCE_ID,
      slug: 'existing-spell',
      name: 'Existing Spell',
      level: 1,
      school: 'evocation',
      castingTime: 'action',
      range: '30 feet',
      components: 'V, S',
      duration: 'instantaneous',
      concentration: false,
      ritual: false,
      classes: '[]',
      description: 'Pre-existing Open5e spell.',
    },
  })
}

async function runJob(xml: string, duplicateDecision?: 'duplicate' | 'skip') {
  const filePath = join(tmpDir, `${Date.now()}-${Math.random()}.xml`)
  writeFileSync(filePath, xml)
  const job = await prisma.importJob.create({
    data: {
      sourceId: 'homebrew',
      jobType: 'FILE',
      contentTypes: JSON.stringify(['FEAT', 'SPELL']),
    },
  })
  await importCompendium({ filePath, jobId: job.id, duplicateDecision })
  return prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })
}

// Only this suite's own rows, by slug — COMPENDIUM_SOURCE_ID is a *real*
// per-book Source id (the same one a genuine Compendium import of
// "Player's Handbook (2024)" content uses), not a synthetic test-only id.
// A blanket deleteMany scoped to just that sourceId would silently wipe out
// real imported content sharing the same book. Only the fully-synthetic
// API_SOURCE_ID (never used by a real import) is safe to clear entirely,
// Source row included.
const TEST_SLUGS = ['fresh-feat', 'fresh-spell', 'another-feat', 'existing-spell']

describe('importCompendium orchestrator', () => {
  afterAll(async () => {
    rmSync(tmpDir, { recursive: true, force: true })
    await prisma.contentFeat.deleteMany({
      where: { sourceId: COMPENDIUM_SOURCE_ID, slug: { in: TEST_SLUGS } },
    })
    await prisma.contentSpell.deleteMany({
      where: { sourceId: COMPENDIUM_SOURCE_ID, slug: { in: TEST_SLUGS } },
    })
    await prisma.contentSpell.deleteMany({ where: { sourceId: API_SOURCE_ID } })
    await prisma.importJob.deleteMany({ where: { sourceId: 'homebrew', jobType: 'FILE' } })
    await prisma.source.deleteMany({ where: { id: API_SOURCE_ID } })
    writeLog('compendium orchestrator: suite done')
  })

  it('imports fresh content, creating a per-book Source distinct from the Open5e source it maps to', async () => {
    await seedOpen5eFixture()
    const job = await runJob(xmlWith(featXml('Fresh Feat'), spellXml('Fresh Spell', 2)))

    expect(job.status).toBe('COMPLETED')
    const feat = await prisma.contentFeat.findFirst({ where: { name: 'Fresh Feat' } })
    expect(feat?.sourceId).toBe(COMPENDIUM_SOURCE_ID)
    const source = await prisma.source.findUnique({ where: { id: COMPENDIUM_SOURCE_ID } })
    expect(source?.type).toBe('FILE')
    expect(source?.id).not.toBe(API_SOURCE_ID) // never reuses the Open5e source id

    writeLog(`compendium orchestrator: fresh import → status ${job.status} [PASS]`)
  })

  it('is additive-only: re-running the same file never overwrites a same-source row, even if locally edited', async () => {
    await prisma.contentFeat.update({
      where: { sourceId_slug: { sourceId: COMPENDIUM_SOURCE_ID, slug: 'fresh-feat' } },
      data: { description: 'Locally corrected text.' },
    })

    await runJob(xmlWith(featXml('Fresh Feat'), spellXml('Fresh Spell', 2)))

    const feat = await prisma.contentFeat.findFirst({ where: { name: 'Fresh Feat' } })
    expect(feat?.description).toBe('Locally corrected text.') // untouched by the re-run

    writeLog('compendium orchestrator: additive-only re-import preserves local edit [PASS]')
  })

  it('pauses in AWAITING_CONFIRMATION on a cross-source name match, writing nothing for that record until confirmed', async () => {
    const job = await runJob(xmlWith(featXml('Another Feat'), spellXml('Existing Spell', 1)))

    expect(job.status).toBe('AWAITING_CONFIRMATION')
    const state = JSON.parse(job.errorLog!)
    expect(state.matchCount).toBe(1)
    expect(state.matches[0]).toMatchObject({ contentType: 'SPELL', name: 'Existing Spell' })

    const notYetWritten = await prisma.contentSpell.findFirst({
      where: { sourceId: COMPENDIUM_SOURCE_ID, name: 'Existing Spell' },
    })
    expect(notYetWritten).toBeNull()

    writeLog('compendium orchestrator: cross-source match pauses for confirmation [PASS]')
  })

  it('resuming with "duplicate" writes the previously-pending record', async () => {
    const pending = await prisma.importJob.findFirstOrThrow({
      where: { sourceId: 'homebrew', jobType: 'FILE', status: 'AWAITING_CONFIRMATION' },
      orderBy: { startedAt: 'desc' },
    })
    const state = JSON.parse(pending.errorLog!) as { filePath: string }

    await importCompendium({
      filePath: state.filePath,
      jobId: pending.id,
      duplicateDecision: 'duplicate',
    })

    const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: pending.id } })
    expect(finalJob.status).toBe('COMPLETED')

    const written = await prisma.contentSpell.findFirst({
      where: { sourceId: COMPENDIUM_SOURCE_ID, name: 'Existing Spell' },
    })
    expect(written).not.toBeNull()

    writeLog('compendium orchestrator: resume with "duplicate" completes the pending record [PASS]')
  })
})

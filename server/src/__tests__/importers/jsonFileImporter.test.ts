import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../db/client.js'
import { extractSections, importJsonFile } from '../../importers/jsonFileImporter.js'
import { writeLog } from '../setup.js'

const tmpDir = mkdtempSync(join(tmpdir(), 'dragonledger-json-import-'))
const SOURCE_ID = 'test-json-import-source'

function writeJson(name: string, data: unknown): string {
  const filePath = join(tmpDir, name)
  writeFileSync(filePath, JSON.stringify(data))
  return filePath
}

describe('extractSections', () => {
  it('accepts the single-type { contentType, entries } shape', () => {
    const result = extractSections({ contentType: 'spell', entries: [{ name: 'Test' }] })
    expect(result.sections).toEqual([{ type: 'spell', entries: [{ name: 'Test' }] }])
  })

  it('accepts the multi-type { spells: [...], items: [...] } shape', () => {
    const result = extractSections({ spells: [{ name: 'A' }], items: [{ name: 'B' }] })
    expect(result.sections).toHaveLength(2)
    expect(result.sections.map((s) => s.type).sort()).toEqual(['item', 'spell'])
  })

  it('reports unrecognized section keys rather than silently dropping them', () => {
    const result = extractSections({ spells: [{ name: 'A' }], subclasses: [{ name: 'B' }] })
    expect(result.unknownSections).toEqual(['subclasses'])
  })

  it('rejects a non-object top level', () => {
    expect(() => extractSections([1, 2, 3])).toThrow()
  })
})

describe('importJsonFile', () => {
  afterAll(async () => {
    await prisma.contentFeat.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentSpell.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.importJob.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.source.deleteMany({ where: { id: SOURCE_ID } })
    rmSync(tmpDir, { recursive: true, force: true })
    writeLog('jsonFileImporter: suite done')
  })

  it('imports a multi-section file, generating slugs and folding unknown fields into extraData', async () => {
    await prisma.source.upsert({
      where: { id: SOURCE_ID },
      update: {},
      create: {
        id: SOURCE_ID,
        name: 'Test JSON Import Source',
        type: 'FILE',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
    const job = await prisma.importJob.create({
      data: { sourceId: SOURCE_ID, jobType: 'JSON_FILE', contentTypes: '[]', status: 'PENDING' },
    })

    const filePath = writeJson('multi.json', {
      feats: [
        {
          name: 'Test Feat From JSON',
          category: 'GENERAL',
          description: 'A feat imported from a JSON file.',
          madeUpField: 'should land in extraData',
        },
      ],
      spells: [
        {
          name: 'Test Spell From JSON',
          slug: 'custom-provided-slug',
          level: 1,
          school: 'evocation',
          castingTime: 'action',
          range: '30 feet',
          components: 'V, S',
          duration: 'instantaneous',
          concentration: false,
          ritual: false,
          classes: ['Wizard'],
          description: 'A spell imported from a JSON file.',
        },
      ],
    })

    await importJsonFile({ filePath, sourceId: SOURCE_ID, jobId: job.id })

    const finished = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })
    const passed = finished.status === 'COMPLETED'
    writeLog(`jsonFileImporter: multi-section import → ${finished.status} [${passed ? 'PASS' : 'FAIL'}]`)
    expect(finished.status).toBe('COMPLETED')

    const feat = await prisma.contentFeat.findFirst({ where: { sourceId: SOURCE_ID, name: 'Test Feat From JSON' } })
    expect(feat).not.toBeNull()
    expect(feat?.slug).toBe('test-feat-from-json') // generated from name
    expect(JSON.parse(feat?.extraData ?? '{}')).toEqual({ madeUpField: 'should land in extraData' })

    const spell = await prisma.contentSpell.findFirst({
      where: { sourceId: SOURCE_ID, name: 'Test Spell From JSON' },
    })
    expect(spell).not.toBeNull()
    expect(spell?.slug).toBe('custom-provided-slug') // honored, not regenerated
  })

  it('marks the job PARTIAL when one section fails validation but another succeeds', async () => {
    await prisma.source.upsert({
      where: { id: SOURCE_ID },
      update: {},
      create: {
        id: SOURCE_ID,
        name: 'Test JSON Import Source',
        type: 'FILE',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
    const job = await prisma.importJob.create({
      data: { sourceId: SOURCE_ID, jobType: 'JSON_FILE', contentTypes: '[]', status: 'PENDING' },
    })
    const filePath = writeJson('partial.json', {
      feats: [{ name: 'Valid Feat', category: 'GENERAL', description: '' }],
      // Conditions require `description` — omit it to force a validation failure.
      conditions: [{ name: 'Broken Condition' }],
    })

    await importJsonFile({ filePath, sourceId: SOURCE_ID, jobId: job.id })

    const finished = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })
    writeLog(`jsonFileImporter: partial failure → ${finished.status} [${finished.status === 'PARTIAL' ? 'PASS' : 'FAIL'}]`)
    expect(finished.status).toBe('PARTIAL')
    expect(JSON.parse(finished.errorLog ?? '[]')).toEqual(
      expect.arrayContaining([expect.objectContaining({ contentType: 'CONDITION' })]),
    )

    const feat = await prisma.contentFeat.findFirst({ where: { sourceId: SOURCE_ID, name: 'Valid Feat' } })
    expect(feat).not.toBeNull()
  })
})

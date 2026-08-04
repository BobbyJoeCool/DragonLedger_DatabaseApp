import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { prisma } from '../db/client.js'
import { writeLog } from './setup.js'

const PASSWORD = process.env.APP_PASSWORD ?? ''
const auth = (req: request.Test) => req.set('x-app-password', PASSWORD)

// Test-created source ids, deleted directly via Prisma in afterAll as a
// safety net in case a test fails before its own cleanup runs.
const createdSourceIds: string[] = []

describe('Source API', () => {
  it('GET /api/sources → 200, includes the seeded homebrew source', async () => {
    const res = await request(app).get('/api/sources')
    const homebrew = res.body.find((s: { id: string }) => s.id === 'homebrew')
    const passed =
      res.status === 200 && homebrew?.isDeletable === false && homebrew?.entryCount === 0
    writeLog(`sources: GET /api/sources → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(200)
    expect(homebrew).toBeDefined()
    expect(homebrew.isDeletable).toBe(false)
    expect(homebrew.entryCount).toBe(0)
  })

  it('POST /api/sources without auth → 401', async () => {
    const res = await request(app).post('/api/sources').send({ name: 'Should Not Be Created' })
    writeLog(`sources: POST without auth → ${res.status} [${res.status === 401 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(401)
  })

  it('POST /api/sources missing name → 400', async () => {
    const res = await auth(request(app).post('/api/sources')).send({ description: 'no name' })
    writeLog(`sources: POST missing name → ${res.status} [${res.status === 400 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(400)
  })

  it('POST /api/sources → 201, creates a slugified MANUAL source', async () => {
    const res = await auth(request(app).post('/api/sources')).send({
      name: 'My Test Source',
      description: 'created by sources.test.ts',
    })
    const passed =
      res.status === 201 && res.body.id === 'my-test-source' && res.body.type === 'MANUAL'
    writeLog(
      `sources: POST /api/sources → ${res.status} ${JSON.stringify(res.body)} [${passed ? 'PASS' : 'FAIL'}]`,
    )
    createdSourceIds.push(res.body.id)
    expect(res.status).toBe(201)
    expect(res.body.id).toBe('my-test-source')
    expect(res.body.type).toBe('MANUAL')
    expect(res.body.isDeletable).toBe(true)
  })

  it('GET /api/sources/:id → 200 for an existing source', async () => {
    const res = await request(app).get('/api/sources/my-test-source')
    const passed = res.status === 200 && res.body.name === 'My Test Source'
    writeLog(
      `sources: GET /api/sources/my-test-source → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`,
    )
    expect(res.status).toBe(200)
    expect(res.body.entryCount).toBe(0)
  })

  it('GET /api/sources/:id → 404 for an unknown id', async () => {
    const res = await request(app).get('/api/sources/does-not-exist')
    writeLog(`sources: GET unknown id → ${res.status} [${res.status === 404 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(404)
  })

  it('DELETE /api/sources/homebrew → 400, protected source is not deleted', async () => {
    const res = await auth(request(app).delete('/api/sources/homebrew'))
    const stillExists = await prisma.source.findUnique({ where: { id: 'homebrew' } })
    const passed = res.status === 400 && stillExists !== null
    writeLog(`sources: DELETE homebrew → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(400)
    expect(stillExists).not.toBeNull()
  })

  it('DELETE /api/sources/:id → 200, deletes a manual source with no dependents', async () => {
    const res = await auth(request(app).delete('/api/sources/my-test-source'))
    const gone = await prisma.source.findUnique({ where: { id: 'my-test-source' } })
    const passed =
      res.status === 200 &&
      Array.isArray(res.body.warnings) &&
      res.body.warnings.length === 0 &&
      gone === null
    writeLog(
      `sources: DELETE my-test-source → ${res.status} ${JSON.stringify(res.body)} [${passed ? 'PASS' : 'FAIL'}]`,
    )
    expect(res.status).toBe(200)
    expect(res.body.warnings).toEqual([])
    expect(gone).toBeNull()
    createdSourceIds.splice(createdSourceIds.indexOf('my-test-source'), 1)
  })

  it('DELETE /api/sources/:id cascades to its content entries', async () => {
    const source = await prisma.source.create({
      data: {
        id: 'cascade-test-source',
        name: 'Cascade Test Source',
        type: 'MANUAL',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
    const spell = await prisma.contentSpell.create({
      data: {
        slug: 'test-spell',
        sourceId: source.id,
        name: 'Test Spell',
        level: 1,
        school: 'evocation',
        castingTime: 'action',
        range: '30 feet',
        components: 'V, S',
        duration: 'instantaneous',
        concentration: false,
        ritual: false,
        classes: '[]',
        description: 'A test spell.',
      },
    })

    const res = await auth(request(app).delete(`/api/sources/${source.id}`))
    const spellGone = await prisma.contentSpell.findUnique({ where: { id: spell.id } })
    const passed = res.status === 200 && spellGone === null
    writeLog(
      `sources: DELETE cascade → ${res.status} spellGone=${spellGone === null} [${passed ? 'PASS' : 'FAIL'}]`,
    )
    expect(res.status).toBe(200)
    expect(spellGone).toBeNull()
  })

  it('DELETE /api/sources/:id orphans (does not delete) cross-source dependents, and reports them as warnings', async () => {
    const parentSource = await prisma.source.create({
      data: {
        id: 'orphan-parent-source',
        name: 'Orphan Parent Source',
        type: 'MANUAL',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
    const otherSource = await prisma.source.create({
      data: {
        id: 'orphan-other-source',
        name: 'Orphan Other Source',
        type: 'MANUAL',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
    const parentClass = await prisma.contentClass.create({
      data: {
        slug: 'test-class',
        sourceId: parentSource.id,
        name: 'Test Class',
        hitDie: 8,
        primaryAbility: '{"abilities":["strength"],"logic":"OR"}',
        savingThrows: '[]',
        armorProfs: '[]',
        weaponProfs: '[]',
        skillChoices: '{}',
        description: 'A test class.',
      },
    })
    const crossSourceSubclass = await prisma.contentSubclass.create({
      data: {
        slug: 'test-subclass',
        sourceId: otherSource.id,
        classId: parentClass.id,
        name: 'Test Subclass',
        description: 'A homebrew subclass of Test Class.',
      },
    })

    const res = await auth(request(app).delete(`/api/sources/${parentSource.id}`))
    const subclassAfter = await prisma.contentSubclass.findUnique({
      where: { id: crossSourceSubclass.id },
    })
    const passed =
      res.status === 200 && res.body.warnings.length === 1 && subclassAfter?.classId === null
    writeLog(
      `sources: DELETE orphan warnings → ${res.status} ${JSON.stringify(res.body.warnings)} [${passed ? 'PASS' : 'FAIL'}]`,
    )
    expect(res.status).toBe(200)
    expect(res.body.warnings).toHaveLength(1)
    expect(res.body.warnings[0]).toContain('Test Subclass')
    expect(subclassAfter).not.toBeNull()
    expect(subclassAfter?.classId).toBeNull()

    // otherSource itself was never touched by the parentSource delete
    await prisma.contentSubclass.delete({ where: { id: crossSourceSubclass.id } })
    await prisma.source.delete({ where: { id: otherSource.id } })
  })

  afterAll(async () => {
    for (const id of createdSourceIds) {
      await prisma.source.deleteMany({ where: { id } })
    }
    writeLog('sources: suite done')
  })
})

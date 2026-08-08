import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { prisma } from '../db/client.js'
import { writeLog } from './setup.js'

// Phase 6 — POST /api/import/file and GET /api/import/:jobId (route-level;
// importJsonFile's own transform/validation behavior is covered in
// importers/jsonFileImporter.test.ts).

const PASSWORD = process.env.APP_PASSWORD ?? ''
const auth = (req: request.Test) => req.set('x-app-password', PASSWORD)

function logResult(label: string, res: request.Response, passed: boolean) {
  writeLog(`import routes: ${label} → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`)
}

const tmpDir = mkdtempSync(join(tmpdir(), 'dragonledger-import-route-'))
const SOURCE_ID = 'test-import-route-source'
const createdJobIds: string[] = []

afterAll(async () => {
  await prisma.contentFeat.deleteMany({ where: { sourceId: SOURCE_ID } })
  await prisma.importJob.deleteMany({ where: { id: { in: createdJobIds } } })
  await prisma.importJob.deleteMany({ where: { sourceId: SOURCE_ID } })
  await prisma.source.deleteMany({ where: { id: SOURCE_ID } })
  rmSync(tmpDir, { recursive: true, force: true })
  writeLog('import routes: suite done')
})

describe('POST /api/import/file', () => {
  it('without auth → 401', async () => {
    const res = await request(app).post('/api/import/file').send({})
    logResult('POST /file no auth', res, res.status === 401)
    expect(res.status).toBe(401)
  })

  it('missing filePath → 400', async () => {
    const res = await auth(request(app).post('/api/import/file')).send({
      sourceId: SOURCE_ID,
      sourceName: 'Test Import Route Source',
    })
    logResult('POST /file missing filePath', res, res.status === 400)
    expect(res.status).toBe(400)
  })

  it('nonexistent file → 400', async () => {
    const res = await auth(request(app).post('/api/import/file')).send({
      sourceId: SOURCE_ID,
      sourceName: 'Test Import Route Source',
      filePath: join(tmpDir, 'does-not-exist.json'),
    })
    logResult('POST /file nonexistent path', res, res.status === 400)
    expect(res.status).toBe(400)
  })

  it('invalid JSON content → 400', async () => {
    const filePath = join(tmpDir, 'invalid.json')
    writeFileSync(filePath, 'not json at all')
    const res = await auth(request(app).post('/api/import/file')).send({
      sourceId: SOURCE_ID,
      sourceName: 'Test Import Route Source',
      filePath,
    })
    logResult('POST /file invalid JSON', res, res.status === 400)
    expect(res.status).toBe(400)
  })

  it('valid file → 202 { jobId }, creates a FILE-type source and a JSON_FILE job', async () => {
    const filePath = join(tmpDir, 'valid.json')
    writeFileSync(
      filePath,
      JSON.stringify({ feats: [{ name: 'Route Test Feat', category: 'GENERAL', description: '' }] }),
    )
    const res = await auth(request(app).post('/api/import/file')).send({
      sourceId: SOURCE_ID,
      sourceName: 'Test Import Route Source',
      filePath,
    })
    const passed = res.status === 202 && typeof res.body.jobId === 'string'
    logResult('POST /file valid', res, passed)
    expect(res.status).toBe(202)
    expect(res.body.jobId).toBeTypeOf('string')
    createdJobIds.push(res.body.jobId)

    const source = await prisma.source.findUnique({ where: { id: SOURCE_ID } })
    expect(source?.type).toBe('FILE')

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: res.body.jobId } })
    expect(job.jobType).toBe('JSON_FILE')
  })
})

describe('GET /api/import/:jobId', () => {
  it('unknown id → 404', async () => {
    const res = await request(app).get('/api/import/does-not-exist')
    logResult('GET /:jobId unknown', res, res.status === 404)
    expect(res.status).toBe(404)
  })

  it('known id → 200, contentTypes/errorLog parsed back into real JSON', async () => {
    const job = await prisma.importJob.create({
      data: {
        sourceId: SOURCE_ID,
        jobType: 'JSON_FILE',
        contentTypes: JSON.stringify(['FEAT']),
        status: 'AWAITING_CONFIRMATION',
        errorLog: JSON.stringify({ matchCount: 1, matches: [{ contentType: 'FEAT', name: 'X' }] }),
      },
    })
    createdJobIds.push(job.id)

    const res = await request(app).get(`/api/import/${job.id}`)
    const passed = res.status === 200 && Array.isArray(res.body.contentTypes) && res.body.errorLog?.matchCount === 1
    logResult('GET /:jobId known', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.contentTypes).toEqual(['FEAT'])
    expect(res.body.errorLog.matchCount).toBe(1)
    expect(res.body.errorLog.matches[0]).toMatchObject({ contentType: 'FEAT', name: 'X' })
  })

  it('does not shadow the literal /history route', async () => {
    const res = await request(app).get('/api/import/history')
    logResult('GET /history not shadowed', res, res.status === 200 && Array.isArray(res.body))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

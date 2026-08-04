import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../db/client.js'
import { writeLog } from './setup.js'

describe('Database Connection', () => {
  it('Prisma client connects and responds', { timeout: 30_000 }, async () => {
    const start = Date.now()
    const result = await prisma.$queryRaw<[{ ping: bigint }]>`SELECT 1 AS ping`
    const ms = Date.now() - start
    // SQLite returns integer results as BigInt via $queryRaw; JSON.stringify
    // can't serialize BigInt natively, so coerce for logging only.
    const serializable = result.map((row) => ({ ping: Number(row.ping) }))
    writeLog(`db: SELECT 1 → ${JSON.stringify(serializable)} in ${ms}ms [PASS]`)
    expect(result).toBeDefined()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    writeLog('db: suite done')
  })
})

import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../db/client.js'
import { writeLog } from './setup.js'

describe('Database Connection', () => {
  it('Prisma client connects and responds', { timeout: 30_000 }, async () => {
    const start = Date.now()
    const result = await prisma.$queryRaw<[{ ping: number }]>`SELECT 1 AS ping`
    const ms = Date.now() - start
    writeLog(`db: SELECT 1 → ${JSON.stringify(result)} in ${ms}ms [PASS]`)
    expect(result).toBeDefined()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    writeLog('db: suite done')
  })
})

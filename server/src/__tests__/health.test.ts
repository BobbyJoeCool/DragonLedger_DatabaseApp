import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { writeLog } from './setup.js'

describe('Health Check', () => {
  it('GET /api/health → 200 { status: ok }', async () => {
    const res = await request(app).get('/api/health')
    const passed = res.status === 200 && res.body.status === 'ok'
    writeLog(`health: GET /api/health → ${res.status} ${JSON.stringify(res.body)} [${passed ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  afterAll(() => writeLog('health: suite done'))
})

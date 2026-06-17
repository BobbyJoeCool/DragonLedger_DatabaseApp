import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { writeLog } from './setup.js'

const PASSWORD = process.env.APP_PASSWORD ?? ''

describe('Auth Middleware', () => {
  it('correct password → 200', async () => {
    const res = await request(app)
      .post('/api/auth/check')
      .set('x-app-password', PASSWORD)
    writeLog(`auth: correct password → ${res.status} [${res.status === 200 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/check')
      .set('x-app-password', 'wrong-password')
    writeLog(`auth: wrong password → ${res.status} [${res.status === 401 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(401)
  })

  it('missing password → 401', async () => {
    const res = await request(app).post('/api/auth/check')
    writeLog(`auth: missing password → ${res.status} [${res.status === 401 ? 'PASS' : 'FAIL'}]`)
    expect(res.status).toBe(401)
  })

  afterAll(() => writeLog('auth: suite done'))
})

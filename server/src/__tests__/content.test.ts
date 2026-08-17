import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { writeLog } from './setup.js'

// Phase 3 — Content Read API. Runs against the live dev.db (same convention
// as sources.test.ts) — assertions lean on real imported content rather than
// fixtures, since these are read-only endpoints with nothing to seed/clean up.

function logResult(label: string, res: request.Response, passed: boolean) {
  writeLog(`content: ${label} → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`)
}

describe('Content Read API — shared envelope', () => {
  it('GET /api/spells → 200, paginated envelope shape', async () => {
    const res = await request(app).get('/api/spells')
    const passed =
      res.status === 200 &&
      Array.isArray(res.body.data) &&
      typeof res.body.total === 'number' &&
      res.body.page === 1 &&
      res.body.limit === 50 &&
      res.body.data.length === 50
    logResult('GET /api/spells envelope', res, passed)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.page).toBe(1)
    expect(res.body.limit).toBe(50)
    expect(res.body.data.length).toBe(50)
    expect(res.body.total).toBeGreaterThan(50)
  })

  it('GET /api/spells JSON fields come back parsed, not double-encoded strings', async () => {
    const res = await request(app).get('/api/spells?q=Fireball')
    const fireball = res.body.data[0]
    const passed = Array.isArray(fireball.classes) && typeof fireball.extraData === 'object'
    logResult('GET /api/spells?q=Fireball JSON parse', res, passed)
    expect(Array.isArray(fireball.classes)).toBe(true)
    expect(fireball.classes).toContain('Wizard')
    expect(typeof fireball.extraData).toBe('object')
  })

  it('pagination: total matches actual count, page 2 offsets correctly', async () => {
    const page1 = await request(app).get('/api/items?type=weapon&limit=10&page=1')
    const page2 = await request(app).get('/api/items?type=weapon&limit=10&page=2')
    const passed =
      page1.body.total === page2.body.total &&
      page1.body.total > 20 &&
      page1.body.data[0].id !== page2.body.data[0].id
    logResult('pagination page1 vs page2', page2, passed)
    expect(page1.body.total).toBe(page2.body.total)
    expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id)
  })

  it('?limit= is clamped to the 200 max', async () => {
    const res = await request(app).get('/api/items?type=weapon&limit=99999')
    logResult('limit clamp', res, res.body.limit === 200)
    expect(res.body.limit).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(200)
  })

  it('?fields=name → bare {id,name}[] array, no envelope, no other fields', async () => {
    const res = await request(app).get('/api/spells?fields=name&q=Fireball')
    const row = Array.isArray(res.body) ? res.body[0] : undefined
    const passed =
      Array.isArray(res.body) && row && Object.keys(row).sort().join(',') === 'id,name'
    logResult('GET /api/spells?fields=name', res, Boolean(passed))
    expect(Array.isArray(res.body)).toBe(true)
    expect(Object.keys(row).sort()).toEqual(['id', 'name'])
  })

  it('?fields=all → bare full-row array, unbounded by the 200 max, JSON fields parsed', async () => {
    // Scoped to a bulk-imported, non-homebrew source (not the whole table)
    // so this doesn't race other parallel test files that create/delete
    // homebrew spells — a filtered-but-identical query run twice in a row
    // should be stable against concurrent writes elsewhere.
    const query = '?source=open5e-srd-2024'
    const all = await request(app).get(`/api/spells${query}&fields=all`)
    const paginated = await request(app).get(`/api/spells${query}&limit=200`)
    const row = Array.isArray(all.body) ? all.body[0] : undefined
    const passed =
      Array.isArray(all.body) &&
      all.body.length === paginated.body.total &&
      all.body.length > 200 &&
      row &&
      Array.isArray(row.classes)
    logResult('GET /api/spells?fields=all', all, Boolean(passed))
    expect(Array.isArray(all.body)).toBe(true)
    expect(all.body.length).toBe(paginated.body.total)
    expect(all.body.length).toBeGreaterThan(200)
    expect(Array.isArray(row.classes)).toBe(true)
  })

  it('?source= filters correctly', async () => {
    const res = await request(app).get('/api/spells?source=open5e-srd-2024&limit=5')
    const passed = res.body.data.every((s: { name: string }) => typeof s.name === 'string')
    logResult('GET /api/spells?source=', res, res.status === 200 && passed)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThan(0)
  })

  it('?source= repeated (multi-select, Phase 5) unions matches across sources', async () => {
    const single = await request(app).get('/api/spells?source=open5e-srd-2024')
    const homebrewOnly = await request(app).get('/api/spells?source=homebrew')
    const both = await request(app).get(
      '/api/spells?source=open5e-srd-2024&source=homebrew',
    )
    const passed = both.body.total === single.body.total + homebrewOnly.body.total
    logResult('GET /api/spells?source= repeated', both, passed)
    expect(both.status).toBe(200)
    expect(both.body.total).toBe(single.body.total + homebrewOnly.body.total)
  })
})

describe('Content Read API — per-type filters', () => {
  it('Spells: level + class combine correctly (finds Fireball)', async () => {
    const res = await request(app).get('/api/spells?level=3&class=Wizard')
    const names = res.body.data.map((s: { name: string }) => s.name)
    const passed = res.status === 200 && names.includes('Fireball')
    logResult('spells level+class combo', res, passed)
    expect(res.status).toBe(200)
    expect(names).toContain('Fireball')
    expect(res.body.data.every((s: { level: number }) => s.level === 3)).toBe(true)
  })

  it('Spells: invalid level → 400', async () => {
    const res = await request(app).get('/api/spells?level=notanumber')
    logResult('spells invalid level', res, res.status === 400)
    expect(res.status).toBe(400)
  })

  it('Items: type + rarity combine correctly', async () => {
    const res = await request(app).get('/api/items?type=weapon&rarity=very-rare')
    const passed = res.body.data.every(
      (i: { itemType: string; rarity: string }) => i.itemType === 'weapon' && i.rarity === 'very-rare',
    )
    logResult('items type+rarity combo', res, res.status === 200 && passed)
    expect(res.status).toBe(200)
    expect(passed).toBe(true)
  })

  it('Monsters: cr + type combine correctly (finds Goblin Boss)', async () => {
    const res = await request(app).get('/api/monsters?cr=1&type=fey')
    const names = res.body.data.map((m: { name: string }) => m.name)
    logResult('monsters cr+type combo', res, names.includes('Goblin Boss'))
    expect(res.status).toBe(200)
    expect(names).toContain('Goblin Boss')
  })

  it('Feats: category filters correctly', async () => {
    const res = await request(app).get('/api/feats?category=ORIGIN&limit=5')
    const passed = res.body.data.every((f: { category: string }) => f.category === 'ORIGIN')
    logResult('feats category filter', res, res.status === 200 && passed)
    expect(res.status).toBe(200)
    expect(passed).toBe(true)
  })

  it('Subclasses: ?classId= scopes to the parent class (Wizard)', async () => {
    const wizard = await request(app).get('/api/classes?q=Wizard&limit=1')
    const classId = wizard.body.data[0].id
    const res = await request(app).get(`/api/subclasses?classId=${classId}`)
    const passed = res.status === 200 && res.body.data.every((s: { classId: string }) => s.classId === classId)
    logResult('subclasses classId filter', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThan(0)
    expect(passed).toBe(true)
  })

  it('Subraces: ?raceId= scopes to the parent race (Elf)', async () => {
    const elf = await request(app).get('/api/races?q=Elf&limit=1')
    const raceId = elf.body.data[0].id
    const res = await request(app).get(`/api/subraces?raceId=${raceId}`)
    logResult('subraces raceId filter', res, res.status === 200)
    expect(res.status).toBe(200)
    expect(res.body.data.every((s: { raceId: string | null }) => s.raceId === raceId)).toBe(true)
  })

  it('Class options: ?pool=Maneuver filters correctly', async () => {
    const res = await request(app).get('/api/class-options?pool=Maneuver&limit=5')
    const passed = res.body.data.every((o: { pool: string }) => o.pool === 'Maneuver')
    logResult('class-options pool filter', res, res.status === 200 && passed)
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThan(0)
    expect(passed).toBe(true)
  })

  it('Conditions: returns a valid paginated envelope', async () => {
    const res = await request(app).get('/api/conditions')
    const passed = res.status === 200 && Array.isArray(res.body.data)
    logResult('conditions envelope', res, passed)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })
})

describe('Content Read API — detail endpoints and 404s', () => {
  it('GET /api/classes/:id includes ordered ContentClassFeature rows', async () => {
    const list = await request(app).get('/api/classes?q=Wizard&limit=1')
    const res = await request(app).get(`/api/classes/${list.body.data[0].id}`)
    const levels = res.body.features.map((f: { level: number }) => f.level)
    const sorted = [...levels].sort((a, b) => a - b)
    const passed = res.status === 200 && Array.isArray(res.body.features) && res.body.features.length > 0
    logResult('GET /api/classes/:id features', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.features.length).toBeGreaterThan(0)
    expect(levels).toEqual(sorted)
  })

  it('GET /api/spells/:id → 404 for unknown id', async () => {
    const res = await request(app).get('/api/spells/does-not-exist')
    logResult('GET /api/spells/:id unknown', res, res.status === 404)
    expect(res.status).toBe(404)
  })

  const detailNotFoundCases: Array<[string, string]> = [
    ['/api/classes', 'Class'],
    ['/api/subclasses', 'Subclass'],
    ['/api/races', 'Race'],
    ['/api/subraces', 'Subrace'],
    ['/api/backgrounds', 'Background'],
    ['/api/conditions', 'Condition'],
    ['/api/items', 'Item'],
    ['/api/monsters', 'Monster'],
    ['/api/feats', 'Feat'],
    ['/api/class-options', 'Class option'],
  ]

  for (const [path, label] of detailNotFoundCases) {
    it(`GET ${path}/:id → 404 for unknown id (${label})`, async () => {
      const res = await request(app).get(`${path}/does-not-exist`)
      logResult(`GET ${path}/:id unknown`, res, res.status === 404)
      expect(res.status).toBe(404)
      expect(res.body.error).toContain(label)
    })
  }
})

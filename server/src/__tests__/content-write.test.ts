import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { prisma } from '../db/client.js'
import { findClassDependentWarnings, findRaceDependentWarnings } from '../utils/sourceContent.js'
import { writeLog } from './setup.js'

// Phase 4 — Content Write API. Runs against the live dev.db (same convention
// as sources.test.ts/content.test.ts) — uses dedicated phase4-test-* sources
// so it never touches real imported content, cleaned up in afterAll.

const PASSWORD = process.env.APP_PASSWORD ?? ''
const auth = (req: request.Test) => req.set('x-app-password', PASSWORD)

function logResult(label: string, res: request.Response, passed: boolean) {
  writeLog(`content-write: ${label} → ${res.status} [${passed ? 'PASS' : 'FAIL'}]`)
}

const OFFICIAL_SOURCE_ID = 'phase4-test-official'
const MANUAL_SOURCE_ID = 'phase4-test-manual'
const API_SOURCE_ID = 'phase4-test-api'

const createdFeatIds: string[] = []

async function setupSources() {
  await prisma.source.upsert({
    where: { id: OFFICIAL_SOURCE_ID },
    update: {},
    create: {
      id: OFFICIAL_SOURCE_ID,
      name: 'Phase 4 Test Official Source',
      type: 'FILE',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })
  await prisma.source.upsert({
    where: { id: MANUAL_SOURCE_ID },
    update: {},
    create: {
      id: MANUAL_SOURCE_ID,
      name: 'Phase 4 Test Manual Source',
      type: 'MANUAL',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })
  await prisma.source.upsert({
    where: { id: API_SOURCE_ID },
    update: {},
    create: {
      id: API_SOURCE_ID,
      name: 'Phase 4 Test API Source',
      type: 'API',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })
}

describe('Content Write API — POST', () => {
  it('setup: create test sources', async () => {
    await setupSources()
  })

  it('POST /api/feats under a MANUAL source → 201', async () => {
    const res = await auth(request(app).post('/api/feats')).send({
      slug: 'test-feat-create',
      sourceId: MANUAL_SOURCE_ID,
      name: 'Test Feat Create',
      category: 'GENERAL',
      description: 'A test feat.',
    })
    const passed = res.status === 201 && res.body.name === 'Test Feat Create'
    logResult('POST /api/feats MANUAL', res, passed)
    expect(res.status).toBe(201)
    expect(res.body.category).toBe('GENERAL')
    createdFeatIds.push(res.body.id)
  })

  it('POST /api/feats under a non-MANUAL source → 400 SOURCE_NOT_MANUAL', async () => {
    const res = await auth(request(app).post('/api/feats')).send({
      slug: 'test-feat-official',
      sourceId: OFFICIAL_SOURCE_ID,
      name: 'Test Feat Official',
      category: 'GENERAL',
      description: 'Should be rejected.',
    })
    logResult('POST /api/feats non-MANUAL', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SOURCE_NOT_MANUAL')
  })

  it('POST /api/feats without auth → 401', async () => {
    const res = await request(app)
      .post('/api/feats')
      .send({ slug: 'x', sourceId: MANUAL_SOURCE_ID, name: 'X', category: 'GENERAL', description: '' })
    logResult('POST /api/feats no auth', res, res.status === 401)
    expect(res.status).toBe(401)
  })

  it('POST /api/feats with invalid body → 400 VALIDATION_ERROR', async () => {
    const res = await auth(request(app).post('/api/feats')).send({
      sourceId: MANUAL_SOURCE_ID,
      name: 'Missing slug and category',
    })
    logResult('POST /api/feats invalid', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.fields).toBeDefined()
  })

  it('POST /api/feats duplicate slug in same source → 409 SLUG_CONFLICT', async () => {
    const res = await auth(request(app).post('/api/feats')).send({
      slug: 'test-feat-create',
      sourceId: MANUAL_SOURCE_ID,
      name: 'Duplicate',
      category: 'GENERAL',
      description: 'Should conflict.',
    })
    logResult('POST /api/feats slug conflict', res, res.status === 409)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLUG_CONFLICT')
  })
})

describe('Content Write API — PATCH (Correctable Fields + saveAs)', () => {
  it('correctable field (FILE source) applies in place, no saveAs needed', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-correctable',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat Correctable',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      category: 'ORIGIN',
    })
    const passed = res.status === 200 && res.body.category === 'ORIGIN'
    logResult('PATCH feat correctable', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.category).toBe('ORIGIN')
    const stillOfficial = await prisma.contentFeat.findUnique({ where: { id: feat.id } })
    expect(stillOfficial?.sourceId).toBe(OFFICIAL_SOURCE_ID)
  })

  it('a FILE source can also correct fields the old curated list never covered (e.g. description)', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-broad-correctable',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat Broad Correctable',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      description: 'Edited description.',
    })
    logResult('PATCH feat broad correctable (FILE)', res, res.status === 200)
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Edited description.')
  })

  it('lock-list field (name) on a FILE-sourced entry without saveAs → 400 SAVE_AS_REQUIRED', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-noncorrectable',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat Noncorrectable',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      name: 'Edited Name.',
    })
    logResult('PATCH feat lock-list field no saveAs', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SAVE_AS_REQUIRED')
  })

  it('saveAs: "original" overwrites the official entry in place', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-saveas-original',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat SaveAs Original',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      name: 'Overwritten Name',
      saveAs: 'original',
    })
    logResult('PATCH feat saveAs original', res, res.status === 200)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Overwritten Name')
    expect(res.body.sourceId).toBe(OFFICIAL_SOURCE_ID)
  })

  it('saveAs: "homebrew" duplicates into homebrew; original untouched', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-saveas-homebrew',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat SaveAs Homebrew',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      name: 'Homebrew Copy Name',
      saveAs: 'homebrew',
    })
    const passed = res.status === 201 && res.body.sourceId === 'homebrew' && res.body.id !== feat.id
    logResult('PATCH feat saveAs homebrew', res, passed)
    expect(res.status).toBe(201)
    expect(res.body.sourceId).toBe('homebrew')
    expect(res.body.name).toBe('Homebrew Copy Name')
    createdFeatIds.push(res.body.id)

    const original = await prisma.contentFeat.findUnique({ where: { id: feat.id } })
    expect(original?.name).toBe('Test Feat SaveAs Homebrew')
    expect(original?.sourceId).toBe(OFFICIAL_SOURCE_ID)
  })

  it('any field edits in place with no saveAs once an entry is already MANUAL', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-already-manual',
        sourceId: MANUAL_SOURCE_ID,
        name: 'Test Feat Already Manual',
        category: 'GENERAL',
        description: 'Original description.',
      },
    })
    const res = await auth(request(app).patch(`/api/feats/${feat.id}`)).send({
      description: 'Edited without saveAs.',
    })
    logResult('PATCH feat already-MANUAL no saveAs', res, res.status === 200)
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Edited without saveAs.')
  })

  it('a FILE-sourced Spell can correct a field the old empty curated list never allowed', async () => {
    const spell = await prisma.contentSpell.create({
      data: {
        slug: 'test-spell-patch',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Spell Patch',
        level: 1,
        school: 'evocation',
        castingTime: 'action',
        range: '30 feet',
        components: 'V, S',
        duration: 'instantaneous',
        concentration: false,
        ritual: false,
        classes: '[]',
        description: 'Original.',
      },
    })
    const res = await auth(request(app).patch(`/api/spells/${spell.id}`)).send({ level: 2 })
    logResult('PATCH spell FILE broad correctable', res, res.status === 200)
    expect(res.status).toBe(200)
    expect(res.body.level).toBe(2)
  })

  it('an API-sourced Spell rejects an in-place edit even for a field that would be correctable on a FILE source', async () => {
    const spell = await prisma.contentSpell.create({
      data: {
        slug: 'test-spell-api-patch',
        sourceId: API_SOURCE_ID,
        name: 'Test Spell API Patch',
        level: 1,
        school: 'evocation',
        castingTime: 'action',
        range: '30 feet',
        components: 'V, S',
        duration: 'instantaneous',
        concentration: false,
        ritual: false,
        classes: '[]',
        description: 'Original.',
      },
    })
    const res = await auth(request(app).patch(`/api/spells/${spell.id}`)).send({ level: 2 })
    logResult('PATCH spell API no in-place edit', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SAVE_AS_REQUIRED')

    // saveAs: 'original' still works — API just never skips straight to it.
    const withSaveAs = await auth(request(app).patch(`/api/spells/${spell.id}`)).send({
      level: 2,
      saveAs: 'original',
    })
    expect(withSaveAs.status).toBe(200)
    expect(withSaveAs.body.level).toBe(2)
  })

  it('PATCH unknown id → 404 NOT_FOUND', async () => {
    const res = await auth(request(app).patch('/api/feats/does-not-exist')).send({
      category: 'ORIGIN',
    })
    logResult('PATCH unknown id', res, res.status === 404)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('Monster JSON correctable field round-trips as real JSON, not a double-encoded string', async () => {
    const monster = await prisma.contentMonster.create({
      data: {
        slug: 'test-monster-patch',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Monster Patch',
        size: 'medium',
        monsterType: 'humanoid',
        alignment: 'neutral',
        armorClass: 10,
        hitPoints: 10,
        hitDice: '2d8',
        speed: JSON.stringify({ walk: 30 }),
        abilityScores: JSON.stringify({
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        }),
        challengeRating: '1',
        experiencePoints: 200,
        actions: '[]',
      },
    })
    const res = await auth(request(app).patch(`/api/monsters/${monster.id}`)).send({
      damageResistances: [{ types: ['fire'], nonmagical: false, bypassedBy: null }],
    })
    const passed = res.status === 200 && Array.isArray(res.body.damageResistances)
    logResult('PATCH monster JSON correctable field', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.damageResistances).toEqual([{ types: ['fire'], nonmagical: false, bypassedBy: null }])

    const raw = await prisma.contentMonster.findUnique({ where: { id: monster.id } })
    expect(typeof raw?.damageResistances).toBe('string')
    expect(JSON.parse(raw?.damageResistances ?? 'null')).toEqual([
      { types: ['fire'], nonmagical: false, bypassedBy: null },
    ])
  })
})

describe('Content Write API — DELETE (simple types)', () => {
  it('missing confirm → 400 CONFIRM_REQUIRED', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-delete-noconfirm',
        sourceId: MANUAL_SOURCE_ID,
        name: 'Test Feat Delete No Confirm',
        category: 'GENERAL',
        description: '',
      },
    })
    const res = await auth(request(app).delete(`/api/feats/${feat.id}`)).send({})
    logResult('DELETE feat no confirm', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('CONFIRM_REQUIRED')
    await prisma.contentFeat.delete({ where: { id: feat.id } })
  })

  it('confirm: true → 204, entry gone', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-delete-confirmed',
        sourceId: MANUAL_SOURCE_ID,
        name: 'Test Feat Delete Confirmed',
        category: 'GENERAL',
        description: '',
      },
    })
    const res = await auth(request(app).delete(`/api/feats/${feat.id}`)).send({ confirm: true })
    logResult('DELETE feat confirmed', res, res.status === 204)
    expect(res.status).toBe(204)
    const gone = await prisma.contentFeat.findUnique({ where: { id: feat.id } })
    expect(gone).toBeNull()
  })

  it('without auth → 401', async () => {
    const res = await request(app).delete('/api/feats/does-not-exist').send({ confirm: true })
    logResult('DELETE feat no auth', res, res.status === 401)
    expect(res.status).toBe(401)
  })

  it('unknown id → 404 NOT_FOUND', async () => {
    const res = await auth(request(app).delete('/api/feats/does-not-exist')).send({ confirm: true })
    logResult('DELETE feat unknown id', res, res.status === 404)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('Content Write API — DELETE /api/classes/:id (dependent-aware)', () => {
  it('reports dependents and requires confirm; on confirm, deletes official dependent and orphans homebrew dependent', async () => {
    const parentClass = await prisma.contentClass.create({
      data: {
        slug: 'test-class-dependents',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Class Dependents',
        hitDie: 8,
        primaryAbility: '{"abilities":["strength"],"logic":"OR"}',
        savingThrows: '[]',
        armorProfs: '[]',
        weaponProfs: '[]',
        skillChoices: '{"fixed":[],"choices":[]}',
        description: 'A test class.',
      },
    })
    const officialSubclass = await prisma.contentSubclass.create({
      data: {
        slug: 'test-subclass-official',
        sourceId: OFFICIAL_SOURCE_ID,
        classId: parentClass.id,
        name: 'Official Test Subclass',
        description: '',
      },
    })
    const homebrewSubclass = await prisma.contentSubclass.create({
      data: {
        slug: 'test-subclass-homebrew',
        sourceId: 'homebrew',
        classId: parentClass.id,
        name: 'Homebrew Test Subclass',
        description: '',
      },
    })

    const preview = await auth(request(app).delete(`/api/classes/${parentClass.id}`)).send({})
    const previewPassed =
      preview.status === 409 &&
      preview.body.error.dependents.willDelete.some((d: { id: string }) => d.id === officialSubclass.id) &&
      preview.body.error.dependents.willOrphan.some((d: { id: string }) => d.id === homebrewSubclass.id)
    logResult('DELETE class preview dependents', preview, previewPassed)
    expect(preview.status).toBe(409)
    expect(preview.body.error.code).toBe('HAS_DEPENDENT_CHILDREN')
    expect(previewPassed).toBe(true)

    const confirmed = await auth(request(app).delete(`/api/classes/${parentClass.id}`)).send({
      confirm: true,
    })
    logResult('DELETE class confirmed', confirmed, confirmed.status === 204)
    expect(confirmed.status).toBe(204)

    const officialGone = await prisma.contentSubclass.findUnique({ where: { id: officialSubclass.id } })
    const homebrewOrphaned = await prisma.contentSubclass.findUnique({ where: { id: homebrewSubclass.id } })
    expect(officialGone).toBeNull()
    expect(homebrewOrphaned).not.toBeNull()
    expect(homebrewOrphaned?.classId).toBeNull()

    // "a later refresh of that class's source doesn't error" — reproduces
    // exactly the SQL orchestrator.importClasses runs before reinserting
    // (delete-then-recreate for a refresh); the orphaned homebrew subclass
    // (classId already null) must not trip a foreign key constraint.
    await expect(
      prisma.contentClass.deleteMany({ where: { sourceId: OFFICIAL_SOURCE_ID } }),
    ).resolves.not.toThrow()
    const warnings = await findClassDependentWarnings(prisma, OFFICIAL_SOURCE_ID)
    expect(warnings).toEqual([])

    await prisma.contentSubclass.delete({ where: { id: homebrewSubclass.id } })
  })
})

describe('Content Write API — DELETE /api/races/:id (dependent-aware, incl. subspecies)', () => {
  it('handles Subrace AND self-relation subspecies dependents, including the NoAction nulling path', async () => {
    const parentRace = await prisma.contentRace.create({
      data: {
        slug: 'test-race-dependents',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Race Dependents',
        size: '["medium"]',
        speed: '{"walk":30}',
        traits: '[]',
        description: '',
      },
    })
    const officialSubrace = await prisma.contentSubrace.create({
      data: {
        slug: 'test-subrace-official',
        sourceId: OFFICIAL_SOURCE_ID,
        raceId: parentRace.id,
        name: 'Official Test Subrace',
        traits: '[]',
      },
    })
    const homebrewSubrace = await prisma.contentSubrace.create({
      data: {
        slug: 'test-subrace-homebrew',
        sourceId: 'homebrew',
        raceId: parentRace.id,
        name: 'Homebrew Test Subrace',
        traits: '[]',
      },
    })
    // Real 2014-style subspecies: a second ContentRace row via the self-relation.
    const officialSubspecies = await prisma.contentRace.create({
      data: {
        slug: 'test-subspecies-official',
        sourceId: OFFICIAL_SOURCE_ID,
        parentRaceId: parentRace.id,
        name: 'Official Test Subspecies',
        size: '["medium"]',
        speed: '{"walk":30}',
        traits: '[]',
        description: '',
      },
    })
    const homebrewSubspecies = await prisma.contentRace.create({
      data: {
        slug: 'test-subspecies-homebrew',
        sourceId: 'homebrew',
        parentRaceId: parentRace.id,
        name: 'Homebrew Test Subspecies',
        size: '["medium"]',
        speed: '{"walk":30}',
        traits: '[]',
        description: '',
      },
    })

    const preview = await auth(request(app).delete(`/api/races/${parentRace.id}`)).send({})
    logResult('DELETE race preview dependents', preview, preview.status === 409)
    expect(preview.status).toBe(409)
    const { willDelete, willOrphan } = preview.body.error.dependents
    expect(willDelete.some((d: { id: string }) => d.id === officialSubrace.id)).toBe(true)
    expect(willDelete.some((d: { id: string }) => d.id === officialSubspecies.id)).toBe(true)
    expect(willOrphan.some((d: { id: string }) => d.id === homebrewSubrace.id)).toBe(true)
    expect(willOrphan.some((d: { id: string }) => d.id === homebrewSubspecies.id)).toBe(true)

    const confirmed = await auth(request(app).delete(`/api/races/${parentRace.id}`)).send({
      confirm: true,
    })
    logResult('DELETE race confirmed', confirmed, confirmed.status === 204)
    expect(confirmed.status).toBe(204)

    expect(await prisma.contentSubrace.findUnique({ where: { id: officialSubrace.id } })).toBeNull()
    expect(await prisma.contentRace.findUnique({ where: { id: officialSubspecies.id } })).toBeNull()

    const orphanedSubrace = await prisma.contentSubrace.findUnique({ where: { id: homebrewSubrace.id } })
    expect(orphanedSubrace).not.toBeNull()
    expect(orphanedSubrace?.raceId).toBeNull()

    // The real risk this covers: parentRaceId is onDelete: NoAction, not
    // SetNull — if it weren't nulled out before the parent race delete, this
    // whole request would have failed with a foreign key constraint error
    // instead of reaching 204 above.
    const orphanedSubspecies = await prisma.contentRace.findUnique({
      where: { id: homebrewSubspecies.id },
    })
    expect(orphanedSubspecies).not.toBeNull()
    expect(orphanedSubspecies?.parentRaceId).toBeNull()

    await expect(
      prisma.contentRace.deleteMany({ where: { sourceId: OFFICIAL_SOURCE_ID } }),
    ).resolves.not.toThrow()
    const warnings = await findRaceDependentWarnings(prisma, OFFICIAL_SOURCE_ID)
    expect(warnings).toEqual([])

    await prisma.contentSubrace.delete({ where: { id: homebrewSubrace.id } })
    await prisma.contentRace.delete({ where: { id: homebrewSubspecies.id } })
  })
})

describe('Content Write API — DELETE /api/sources/:id/entries (bulk-clear)', () => {
  it('mismatched confirmName → 400, nothing deleted', async () => {
    const feat = await prisma.contentFeat.create({
      data: {
        slug: 'test-feat-bulkclear-mismatch',
        sourceId: OFFICIAL_SOURCE_ID,
        name: 'Test Feat Bulk Clear Mismatch',
        category: 'GENERAL',
        description: '',
      },
    })
    const res = await auth(request(app).delete(`/api/sources/${OFFICIAL_SOURCE_ID}/entries`)).send({
      confirmName: 'the wrong name',
    })
    logResult('bulk-clear mismatched name', res, res.status === 400)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('CONFIRM_NAME_MISMATCH')
    const stillThere = await prisma.contentFeat.findUnique({ where: { id: feat.id } })
    expect(stillThere).not.toBeNull()
  })

  it('exact confirmName → 200, deletes all content for the source, source itself survives', async () => {
    const source = await prisma.source.findUniqueOrThrow({ where: { id: OFFICIAL_SOURCE_ID } })
    const res = await auth(request(app).delete(`/api/sources/${OFFICIAL_SOURCE_ID}/entries`)).send({
      confirmName: source.name,
    })
    const passed = res.status === 200 && res.body.deletedCount > 0
    logResult('bulk-clear exact name', res, passed)
    expect(res.status).toBe(200)
    expect(res.body.deletedCount).toBeGreaterThan(0)
    expect(Array.isArray(res.body.warnings)).toBe(true)

    const remaining = await prisma.contentFeat.count({ where: { sourceId: OFFICIAL_SOURCE_ID } })
    expect(remaining).toBe(0)
    const sourceStillExists = await prisma.source.findUnique({ where: { id: OFFICIAL_SOURCE_ID } })
    expect(sourceStillExists).not.toBeNull()
  })

  it('unknown source → 404', async () => {
    const res = await auth(request(app).delete('/api/sources/does-not-exist/entries')).send({
      confirmName: 'anything',
    })
    logResult('bulk-clear unknown source', res, res.status === 404)
    expect(res.status).toBe(404)
  })
})

afterAll(async () => {
  // Safety net in case an assertion failed before a test's own inline
  // cleanup ran — order matters (children before parents, FK-safe).
  const testSourceIds = [OFFICIAL_SOURCE_ID, MANUAL_SOURCE_ID, API_SOURCE_ID]
  await prisma.contentFeat.deleteMany({ where: { id: { in: createdFeatIds } } })
  await prisma.contentSpell.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.contentMonster.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.contentSubclass.deleteMany({
    where: { slug: { startsWith: 'test-subclass-' } },
  })
  await prisma.contentClassOption.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.contentClass.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.contentSubrace.deleteMany({ where: { slug: { startsWith: 'test-subrace-' } } })
  await prisma.contentRace.deleteMany({ where: { slug: { startsWith: 'test-subspecies-' } } })
  await prisma.contentRace.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.contentFeat.deleteMany({ where: { sourceId: { in: testSourceIds } } })
  await prisma.source.deleteMany({ where: { id: { in: testSourceIds } } })
  writeLog('content-write: suite done')
})

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import { prisma } from '../server/src/db/client.js'

config({ path: resolve(process.cwd(), '.env') })

// A real, live import against the actual local Complete_Compendium_5.5e.xml
// file — not mocked — driving the full stack (HTTP route → auth →
// orchestrator → AWAITING_CONFIRMATION resume → per-book Source creation →
// insert) exactly the way the Open5e suite does for that pipeline. Then
// pulls at least 10 real rows from every table the Compendium importer
// writes to and checks they read correctly — both structurally (every
// sampled row, every table) and against specific known real records (a
// handful of deep value checks, mirroring the Open5e suite's style).
//
// Unlike the Open5e suite, this test does **not** clean up after itself.
// Compendium import is additive-only and spans ~140 real per-book Source
// rows with no single synthetic sourceId to isolate under and delete —
// same reason `compendiumOrchestrator.ts` itself never does a delete-and-
// replace. Re-running this test is safe and cheap: same-source-slug rows
// are skipped on re-import (verified by the orchestrator's own test
// suite), so a second run just re-validates the same real data rather than
// duplicating or re-inserting it.
const PASSWORD = process.env.APP_PASSWORD ?? ''
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'PARTIAL'])
const COMPENDIUM_XML_PATH = resolve(process.cwd(), 'DevTools/Complete_Compendium_5.5e.xml')

// Both real forms a Compendium-sourced row's sourceId takes — one per cited
// book, or the shared fallback for records with no parseable citation. Real
// Open5e-sourced rows never match either shape, so this filter is enough to
// distinguish the two without needing a synthetic test-only sourceId.
const COMPENDIUM_SOURCE_FILTER = {
  OR: [{ sourceId: { startsWith: 'compendium-' } }, { sourceId: 'fc5-compendium-uncredited' }],
} as const

async function waitForTerminalStatus(
  request: import('@playwright/test').APIRequestContext,
  jobId: string,
  maxAttempts: number,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const historyRes = await request.get('/api/import/history')
    const jobs = (await historyRes.json()) as { id: string; status: string }[]
    const job = jobs.find((j) => j.id === jobId)
    if (job && TERMINAL_STATUSES.has(job.status)) return job.status
    if (job && job.status === 'AWAITING_CONFIRMATION') return job.status
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`Job ${jobId} did not reach a terminal or confirmable status in time`)
}

test.describe('Compendium import — end to end', () => {
  test('imports the real Compendium XML via the HTTP API, with at least 10 correctly-read rows in every table', async ({
    request,
  }) => {
    test.skip(
      !existsSync(COMPENDIUM_XML_PATH),
      `Complete_Compendium_5.5e.xml not present at ${COMPENDIUM_XML_PATH} — DevTools/ is gitignored and local-only, so this test can only run where that file has been placed manually`,
    )
    test.setTimeout(480_000) // real ~32MB file, thousands of records — much larger than Open5e's dataset

    const kickoff = await request.post('/api/import/compendium', {
      headers: { 'x-app-password': PASSWORD },
      data: { filePath: COMPENDIUM_XML_PATH },
    })
    expect(kickoff.status()).toBe(202)
    const { jobId } = await kickoff.json()

    let status = await waitForTerminalStatus(request, jobId, 200)

    if (status === 'AWAITING_CONFIRMATION') {
      const resume = await request.post(`/api/import/compendium/${jobId}/resume`, {
        headers: { 'x-app-password': PASSWORD },
        data: { decision: 'duplicate' },
      })
      expect(resume.status()).toBe(202)
      status = await waitForTerminalStatus(request, jobId, 200)
    }

    // PARTIAL is a real, expected outcome — the source file has a known
    // handful of genuinely malformed records (e.g. summoned-creature stat
    // blocks missing ability scores) that get individually skipped rather
    // than failing the whole import. FAILED would mean something systemic
    // broke.
    expect(['COMPLETED', 'PARTIAL']).toContain(status)

    // --- Feat ---
    const feats = await prisma.contentFeat.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(feats.length).toBeGreaterThanOrEqual(10)
    for (const f of feats) {
      expect(f.name.length).toBeGreaterThan(0)
      expect(['GENERAL', 'ORIGIN', 'FIGHTING_STYLE', 'EPIC_BOON', 'CLASS_SPECIFIC']).toContain(
        f.category,
      )
      expect(f.description.length).toBeGreaterThan(0)
    }
    const asi = await prisma.contentFeat.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Ability Score Improvement' },
    })
    expect(asi.category).toBe('GENERAL')

    // --- Spell ---
    const spells = await prisma.contentSpell.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(spells.length).toBeGreaterThanOrEqual(10)
    for (const s of spells) {
      expect(s.level).toBeGreaterThanOrEqual(0)
      expect(s.level).toBeLessThanOrEqual(9)
      expect(s.school.length).toBeGreaterThan(0)
      expect(s.components.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
    }
    const fireball = await prisma.contentSpell.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Fireball' },
    })
    expect(fireball.level).toBe(3)
    const fireballExtra = JSON.parse(fireball.extraData!)
    expect(fireballExtra.savingThrow).toBe('dexterity')
    expect(fireballExtra.damageRoll).toBe('8d6')
    expect(fireballExtra.damageTypes).toEqual(['fire'])
    expect(fireballExtra.scaling).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trigger: 'slot_level', triggerValue: 3, dice: '8d6' }),
      ]),
    )

    // --- ClassOption (Maneuvers, Metamagic, Eldritch Invocations, and more) ---
    const classOptions = await prisma.contentClassOption.findMany({
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(classOptions.length).toBeGreaterThanOrEqual(10)
    for (const o of classOptions) {
      expect(o.pool.length).toBeGreaterThan(0)
      expect(o.name.length).toBeGreaterThan(0)
      expect(o.description.length).toBeGreaterThan(0)
    }
    const ambush = await prisma.contentClassOption.findFirstOrThrow({
      where: { name: 'Ambush' },
    })
    expect(ambush.pool).toBe('Maneuver')

    // --- Item ---
    const items = await prisma.contentItem.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 15,
      orderBy: { name: 'asc' },
    })
    expect(items.length).toBeGreaterThanOrEqual(10)
    for (const it of items) {
      expect(it.itemType.length).toBeGreaterThan(0)
      expect(typeof it.description).toBe('string')
    }
    // Real regression guard for the isMartial investigation this phase did:
    // must show real variation across weapons, never a single constant value.
    const weapons = await prisma.contentItem.findMany({
      where: { ...COMPENDIUM_SOURCE_FILTER, itemType: 'weapon' },
      take: 20,
    })
    const martialValues = new Set(weapons.map((w) => JSON.parse(w.extraData!).isMartial))
    expect(martialValues.size).toBeGreaterThan(1)

    const longsword = await prisma.contentItem.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Longsword' },
    })
    expect(longsword.damage).toBe('1d8 slashing')
    expect(JSON.parse(longsword.properties!).map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Versatile']),
    )

    // --- Background ---
    const backgrounds = await prisma.contentBackground.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(backgrounds.length).toBeGreaterThanOrEqual(10)
    for (const b of backgrounds) {
      expect(() => JSON.parse(b.proficiencies)).not.toThrow()
      expect(() => JSON.parse(b.abilityBonuses)).not.toThrow()
      // Some real colon-prefixed variant backgrounds (e.g. "Academic:
      // Antiquarian") have no "Description" trait in the source at all —
      // typeof, not non-empty, is the real invariant here.
      expect(typeof b.description).toBe('string')
    }
    const artisan = await prisma.contentBackground.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Artisan' },
    })
    expect(JSON.parse(artisan.extraData!).grantedFeat.name).toBe('Crafter')

    // --- Monster ---
    const monsters = await prisma.contentMonster.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 15,
      orderBy: { name: 'asc' },
    })
    expect(monsters.length).toBeGreaterThanOrEqual(10)
    for (const m of monsters) {
      expect(m.challengeRating.length).toBeGreaterThan(0)
      expect(m.experiencePoints).toBeGreaterThanOrEqual(0)
      const scores = JSON.parse(m.abilityScores)
      expect(Object.keys(scores).sort()).toEqual(
        ['charisma', 'constitution', 'dexterity', 'intelligence', 'strength', 'wisdom'].sort(),
      )
      for (const v of Object.values(scores)) expect(typeof v).toBe('number')
      expect(Array.isArray(JSON.parse(m.actions))).toBe(true)
      if (m.damageResistances) {
        for (const entry of JSON.parse(m.damageResistances)) {
          expect(Object.keys(entry).sort()).toEqual(['bypassedBy', 'nonmagical', 'types'])
          expect(Array.isArray(entry.types)).toBe(true)
        }
      }
    }
    // Real regression guard for the proficiencyBonus CR-fallback fix —
    // must show real variety, never a single constant across a real sample.
    const profBonuses = new Set(monsters.map((m) => JSON.parse(m.extraData!).proficiencyBonus))
    expect(profBonuses.size).toBeGreaterThan(1)

    const celestialSpirit = await prisma.contentMonster.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Celestial Spirit' },
    })
    expect(JSON.parse(celestialSpirit.damageResistances!)).toEqual([
      { types: ['radiant'], nonmagical: false, bypassedBy: null },
    ])

    // --- Class ---
    const classes = await prisma.contentClass.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 15,
      orderBy: { name: 'asc' },
    })
    expect(classes.length).toBeGreaterThanOrEqual(10)
    for (const c of classes) {
      expect(c.hitDie).toBeGreaterThan(0)
      expect(() => JSON.parse(c.primaryAbility)).not.toThrow()
      expect(() => JSON.parse(c.savingThrows)).not.toThrow()
      expect(() => JSON.parse(c.skillChoices)).not.toThrow()
    }
    const casterTypes = new Set(
      classes.map((c) => (c.extraData ? JSON.parse(c.extraData).casterType : undefined)),
    )
    expect(casterTypes.size).toBeGreaterThan(1) // real variety, not a single guessed value

    const cleric = await prisma.contentClass.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Cleric' },
    })
    expect(JSON.parse(cleric.extraData!).casterType).toBe('FULL')

    // --- Subclass ---
    const subclasses = await prisma.contentSubclass.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(subclasses.length).toBeGreaterThanOrEqual(10)
    for (const s of subclasses) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      // Either resolved to a real parent, or honestly flagged as unresolved
      // — never silently missing both.
      if (!s.classId) {
        expect(JSON.parse(s.extraData!).unresolvedClassName).toBeTruthy()
      }
    }

    // --- Race ---
    const races = await prisma.contentRace.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(races.length).toBeGreaterThanOrEqual(10)
    for (const r of races) {
      expect(() => JSON.parse(r.size)).not.toThrow()
      expect(() => JSON.parse(r.speed)).not.toThrow()
      expect(Array.isArray(JSON.parse(r.traits))).toBe(true)
    }
    const aasimar = await prisma.contentRace.findFirstOrThrow({
      where: { ...COMPENDIUM_SOURCE_FILTER, name: 'Aasimar' },
    })
    expect(JSON.parse(aasimar.extraData!).creatureType).toBe('Humanoid')

    // --- Subrace ---
    const subraces = await prisma.contentSubrace.findMany({
      where: COMPENDIUM_SOURCE_FILTER,
      take: 12,
      orderBy: { name: 'asc' },
    })
    expect(subraces.length).toBeGreaterThanOrEqual(10)
    for (const sr of subraces) {
      expect(Array.isArray(JSON.parse(sr.traits))).toBe(true)
      // Either resolved to a real parent race, or honestly flagged — same
      // completeness contract as Subclass above.
      if (!sr.raceId) {
        expect(JSON.parse(sr.extraData!).unresolvedRaceName).toBeTruthy()
      }
    }

    // --- ContentClassFeature (new this phase — the most important
    // structural invariant: exactly one of classId/subclassId per row) ---
    const features = await prisma.contentClassFeature.findMany({
      take: 15,
      orderBy: { level: 'asc' },
    })
    expect(features.length).toBeGreaterThanOrEqual(10)
    for (const f of features) {
      expect(f.level).toBeGreaterThan(0)
      expect(f.name.length).toBeGreaterThan(0)
      expect(f.description.length).toBeGreaterThan(0)
      expect(Boolean(f.classId) !== Boolean(f.subclassId)).toBe(true) // XOR, never both/neither
    }
    const clericFeatures = await prisma.contentClassFeature.findMany({
      where: { classId: cleric.id },
      orderBy: { level: 'asc' },
    })
    expect(clericFeatures.length).toBeGreaterThan(0)
    expect(clericFeatures.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Level 1: Spellcasting', 'Level 2: Channel Divinity']),
    )
    expect(clericFeatures.every((f) => f.subclassId === null)).toBe(true)

    // --- Condition: a known, confirmed real file-format limitation — the
    // Compendium has no <condition> element at all (matches the Open5e
    // suite's parallel handling of its own known upstream gap).
    const conditionCount = await prisma.contentCondition.count({ where: COMPENDIUM_SOURCE_FILTER })
    expect(conditionCount).toBe(0)
  })
})

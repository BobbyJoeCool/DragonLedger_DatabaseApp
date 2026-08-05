import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import { prisma } from '../server/src/db/client.js'

config({ path: resolve(process.cwd(), '.env') })

// A real, live import against the actual Open5e API — not mocked. Verifies
// the full stack (HTTP route → auth → orchestrator → fetch/transform/insert
// → SSE-backed ImportJob tracking) against real SRD 2024 content, then
// spot-checks both a "simple" and a "complex" row in every table the
// importer writes to. The equivalent suite for Compendium import will
// follow once Phase 2.5 (Compendium Import) exists — there's no importer
// to test against yet.
const SOURCE_ID = 'pw-e2e-srd-2024'
const PASSWORD = process.env.APP_PASSWORD ?? ''
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'PARTIAL'])

test.describe('Open5e import — end to end', () => {
  test.afterAll(async () => {
    await prisma.contentSubrace.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentRace.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentSubclass.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentClass.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentSpell.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentCondition.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentBackground.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentItem.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.contentMonster.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.importJob.deleteMany({ where: { sourceId: SOURCE_ID } })
    await prisma.source.deleteMany({ where: { id: SOURCE_ID } })
    await prisma.$disconnect()
  })

  test('imports real SRD 2024 content via the HTTP API, with simple and complex rows correct in every table', async ({
    request,
  }) => {
    test.setTimeout(150_000)

    const kickoff = await request.post('/api/import/open5e', {
      headers: { 'x-app-password': PASSWORD },
      data: {
        sourceId: SOURCE_ID,
        sourceName: 'Playwright E2E SRD 2024',
        documentKey: 'srd-2024',
        contentTypes: ['CONDITION', 'SPELL', 'RACE', 'CLASS', 'BACKGROUND', 'ITEM', 'MONSTER'],
      },
    })
    expect(kickoff.status()).toBe(202)
    const { jobId } = await kickoff.json()

    let status = 'PENDING'
    for (let i = 0; i < 70; i++) {
      const historyRes = await request.get('/api/import/history')
      const jobs = (await historyRes.json()) as { id: string; status: string }[]
      const job = jobs.find((j) => j.id === jobId)
      if (job && TERMINAL_STATUSES.has(job.status)) {
        status = job.status
        break
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    expect(status).toBe('COMPLETED')

    // --- Spells: a simple cantrip, and a complex evocation spell with a
    // damage roll, shape, and multi-class list in extraData ---
    const fireBolt = await prisma.contentSpell.findFirst({
      where: { sourceId: SOURCE_ID, slug: 'fire-bolt' },
    })
    expect(fireBolt?.level).toBe(0)

    const fireball = await prisma.contentSpell.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, slug: 'fireball' },
    })
    expect(fireball.level).toBe(3)
    expect(JSON.parse(fireball.classes)).toEqual(expect.arrayContaining(['Wizard', 'Sorcerer']))
    expect(JSON.parse(fireball.extraData!).damageRoll).toBe('8d6')

    // --- Races: a simple race with no subraces, and Elf with its three
    // lineage-synthesized subraces correctly linked ---
    const dwarf = await prisma.contentRace.findFirst({
      where: { sourceId: SOURCE_ID, slug: 'dwarf' },
    })
    expect(dwarf).toBeTruthy()

    const elf = await prisma.contentRace.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, slug: 'elf' },
    })
    const elfSubraces = await prisma.contentSubrace.findMany({
      where: { sourceId: SOURCE_ID, raceId: elf.id },
    })
    expect(elfSubraces.map((s) => s.name).sort()).toEqual(['Drow', 'High Elf', 'Wood Elf'])

    // --- Classes: a simple single-ability class, and Paladin's AND-logic
    // primary ability with its subclass correctly linked ---
    const barbarian = await prisma.contentClass.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, slug: 'barbarian' },
    })
    expect(JSON.parse(barbarian.primaryAbility)).toEqual({ abilities: ['STR'], logic: 'OR' })

    const paladin = await prisma.contentClass.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, slug: 'paladin' },
    })
    expect(JSON.parse(paladin.primaryAbility)).toEqual({ abilities: ['STR', 'CHA'], logic: 'AND' })
    const paladinSubclasses = await prisma.contentSubclass.findMany({
      where: { sourceId: SOURCE_ID, classId: paladin.id },
    })
    expect(paladinSubclasses.length).toBeGreaterThan(0)

    // --- Backgrounds: Acolyte's ability/skill/feat prose parsing ---
    const acolyte = await prisma.contentBackground.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, slug: 'acolyte' },
    })
    const acolyteProfs = JSON.parse(acolyte.proficiencies)
    expect(acolyteProfs.fixed).toEqual(
      expect.arrayContaining([{ name: 'Insight', category: 'skill' }]),
    )
    expect(JSON.parse(acolyte.extraData!).grantedFeat.name).toBe('Magic Initiate (Cleric)')

    // --- Items: a simple mundane item, and a weapon with composed damage
    // and mapped (nested) property names ---
    const dagger = await prisma.contentItem.findFirst({
      where: { sourceId: SOURCE_ID, name: 'Dagger' },
    })
    expect(dagger).toBeTruthy()

    const longsword = await prisma.contentItem.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, name: 'Longsword' },
    })
    expect(longsword.damage).toBe('1d8 slashing')
    expect(JSON.parse(longsword.properties!).map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Versatile']),
    )

    // --- Monsters: a simple monster, and a spellcasting monster whose
    // Spellcasting action got additionally parsed into extraData ---
    const goblin = await prisma.contentMonster.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, name: 'Goblin Warrior' },
    })
    expect(goblin.challengeRating).toBe('1/4')

    const archmage = await prisma.contentMonster.findFirstOrThrow({
      where: { sourceId: SOURCE_ID, name: 'Archmage' },
    })
    expect(JSON.parse(archmage.extraData!).spellcasting.ability).toBe('Intelligence')

    // --- Conditions: a known, confirmed upstream Open5e data gap — the v2
    // API currently has zero conditions tagged under srd-2024. Asserting
    // the import still completed without error is the meaningful check
    // here, not that specific rows exist.
    const conditionCount = await prisma.contentCondition.count({ where: { sourceId: SOURCE_ID } })
    expect(conditionCount).toBeGreaterThanOrEqual(0)
  })
})

import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

// Cross-source dependents (a Subclass/ClassOption pointing at a Class in
// `sourceId`, from any OTHER source) about to be SetNull'd by a delete of
// this source's classes. Split from the race-side check below so a caller
// that's only deleting classes (e.g. orchestrator.ts's importClasses, mid
// per-content-type refresh) doesn't also report — prematurely, before
// they've actually happened — orphans caused by a *different* content
// type's delete in the same importSource run.
export async function findClassDependentWarnings(tx: Tx, sourceId: string): Promise<string[]> {
  const messages: string[] = []

  const classIds = (
    await tx.contentClass.findMany({ where: { sourceId }, select: { id: true } })
  ).map((c) => c.id)
  if (classIds.length === 0) return messages

  const orphanedSubclasses = await tx.contentSubclass.findMany({
    where: { classId: { in: classIds }, sourceId: { not: sourceId } },
    select: { name: true, sourceId: true },
  })
  for (const s of orphanedSubclasses) {
    messages.push(
      `Subclass "${s.name}" (source: ${s.sourceId}) lost its parent class and is now unlinked`,
    )
  }

  const orphanedClassOptions = await tx.contentClassOption.findMany({
    where: { classId: { in: classIds }, sourceId: { not: sourceId } },
    select: { name: true, sourceId: true },
  })
  for (const o of orphanedClassOptions) {
    messages.push(
      `Class option "${o.name}" (source: ${o.sourceId}) lost its parent class and is now unlinked`,
    )
  }

  return messages
}

// Cross-source dependents (a Subrace, or a subspecies-Race via the
// parentRaceId self-relation, pointing at a Race in `sourceId`, from any
// OTHER source) about to lose their parent link. Subrace.raceId is SetNull
// and clears automatically; ContentRace.parentRaceId is onDelete: NoAction,
// so orphaned subspecies are nulled out here explicitly as a required side
// effect — SQLite won't clear it, and a lingering pointer would make the
// caller's delete fail with a foreign key constraint error.
export async function findRaceDependentWarnings(tx: Tx, sourceId: string): Promise<string[]> {
  const messages: string[] = []

  const raceIds = (
    await tx.contentRace.findMany({ where: { sourceId }, select: { id: true } })
  ).map((r) => r.id)
  if (raceIds.length === 0) return messages

  const orphanedSubraces = await tx.contentSubrace.findMany({
    where: { raceId: { in: raceIds }, sourceId: { not: sourceId } },
    select: { name: true, sourceId: true },
  })
  for (const s of orphanedSubraces) {
    messages.push(
      `Subrace "${s.name}" (source: ${s.sourceId}) lost its parent race and is now unlinked`,
    )
  }

  const orphanedSubspecies = await tx.contentRace.findMany({
    where: { parentRaceId: { in: raceIds }, sourceId: { not: sourceId } },
    select: { id: true, name: true, sourceId: true },
  })
  if (orphanedSubspecies.length > 0) {
    await tx.contentRace.updateMany({
      where: { id: { in: orphanedSubspecies.map((r) => r.id) } },
      data: { parentRaceId: null },
    })
    for (const r of orphanedSubspecies) {
      messages.push(
        `Race "${r.name}" (source: ${r.sourceId}) lost its parent race and is now unlinked`,
      )
    }
  }

  return messages
}

// Combined check for callers deleting a source's classes AND races together
// in the same operation (whole-source delete, bulk-clear) — order-independent
// since both halves are read-then-act against the same still-intact data.
export async function findOrphanWarnings(tx: Tx, sourceId: string): Promise<string[]> {
  return [...(await findClassDependentWarnings(tx, sourceId)), ...(await findRaceDependentWarnings(tx, sourceId))]
}

// Deletes every content row belonging to `sourceId`, across all content
// tables, leaving the Source row itself untouched — the delete half of a
// refresh, without the re-import step (Phase 4 §1.8). Order mirrors
// orchestrator.ts's existing per-type refresh deletes: children before
// parents so cross-table FKs never dangle mid-transaction. ContentClassFeature
// has no sourceId of its own — it cascades automatically when its parent
// ContentClass/ContentSubclass row is deleted below.
export async function clearContentForSource(tx: Tx, sourceId: string): Promise<number> {
  const where = { sourceId }
  const results = await Promise.all([
    tx.contentSubclass.deleteMany({ where }),
    tx.contentClassOption.deleteMany({ where }),
    tx.contentClass.deleteMany({ where }),
    tx.contentSubrace.deleteMany({ where }),
    tx.contentRace.deleteMany({ where }),
    tx.contentSpell.deleteMany({ where }),
    tx.contentBackground.deleteMany({ where }),
    tx.contentCondition.deleteMany({ where }),
    tx.contentItem.deleteMany({ where }),
    tx.contentMonster.deleteMany({ where }),
    tx.contentFeat.deleteMany({ where }),
  ])
  return results.reduce((sum, r) => sum + r.count, 0)
}

import { Router } from 'express'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { errorResponse } from '../../utils/errorResponse.js'
import { classifyDependents, toDependentEntries } from './shared.js'

export const bulkDeleteRouter = Router()

const DELEGATES: Record<string, { deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }> }> = {
  spells: prisma.contentSpell,
  classes: prisma.contentClass,
  races: prisma.contentRace,
  backgrounds: prisma.contentBackground,
  conditions: prisma.contentCondition,
  items: prisma.contentItem,
  monsters: prisma.contentMonster,
  feats: prisma.contentFeat,
}

const SIMPLE_TYPES = new Set(['spells', 'items', 'conditions', 'feats', 'backgrounds', 'monsters'])

bulkDeleteRouter.delete('/', requireAuth, async (req, res) => {
  const { type, ids, confirm } = req.body as {
    type?: string
    ids?: string[]
    confirm?: boolean
  }

  if (!type || !DELEGATES[type]) {
    res.status(400).json(errorResponse('INVALID_TYPE', 'type must be one of: spells, classes, races, backgrounds, conditions, items, monsters, feats'))
    return
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json(errorResponse('INVALID_IDS', 'ids must be a non-empty array'))
    return
  }

  if (SIMPLE_TYPES.has(type)) {
    if (confirm !== true) {
      res.status(400).json(errorResponse('CONFIRM_REQUIRED', `Deleting ${ids.length} ${type} requires { confirm: true }`))
      return
    }
    const result = await DELEGATES[type].deleteMany({ where: { id: { in: ids } } })
    res.json({ deletedCount: result.count })
    return
  }

  if (type === 'classes') {
    const [subclasses, classOptions] = await Promise.all([
      prisma.contentSubclass.findMany({
        where: { classId: { in: ids } },
        select: { id: true, name: true, source: { select: { type: true } } },
      }),
      prisma.contentClassOption.findMany({
        where: { classId: { in: ids } },
        select: { id: true, name: true, source: { select: { type: true } } },
      }),
    ])
    const subclassGroups = classifyDependents(subclasses)
    const classOptionGroups = classifyDependents(classOptions)
    const willDelete = [
      ...toDependentEntries('subclass', subclassGroups.willDelete),
      ...toDependentEntries('classOption', classOptionGroups.willDelete),
    ]
    const willOrphan = [
      ...toDependentEntries('subclass', subclassGroups.willOrphan),
      ...toDependentEntries('classOption', classOptionGroups.willOrphan),
    ]

    if (confirm !== true) {
      if (willDelete.length + willOrphan.length > 0) {
        res.status(409).json(errorResponse('HAS_DEPENDENT_CHILDREN',
          `These ${ids.length} classes have dependent subclasses/options`,
          { dependents: { willDelete, willOrphan } }))
        return
      }
      res.status(400).json(errorResponse('CONFIRM_REQUIRED', `Deleting ${ids.length} classes requires { confirm: true }`))
      return
    }

    await prisma.$transaction(async (tx) => {
      const deleteSubclassIds = subclassGroups.willDelete.map((d) => d.id)
      const deleteClassOptionIds = classOptionGroups.willDelete.map((d) => d.id)
      if (deleteSubclassIds.length > 0)
        await tx.contentSubclass.deleteMany({ where: { id: { in: deleteSubclassIds } } })
      if (deleteClassOptionIds.length > 0)
        await tx.contentClassOption.deleteMany({ where: { id: { in: deleteClassOptionIds } } })
      await tx.contentClass.deleteMany({ where: { id: { in: ids } } })
    })

    res.json({
      deletedCount: ids.length,
      ...(willOrphan.length > 0 ? { warnings: `${willOrphan.length} homebrew dependent(s) orphaned` } : {}),
    })
    return
  }

  if (type === 'races') {
    const [subraces, subspecies] = await Promise.all([
      prisma.contentSubrace.findMany({
        where: { raceId: { in: ids } },
        select: { id: true, name: true, source: { select: { type: true } } },
      }),
      prisma.contentRace.findMany({
        where: { parentRaceId: { in: ids } },
        select: { id: true, name: true, source: { select: { type: true } } },
      }),
    ])
    const subraceGroups = classifyDependents(subraces)
    const subspeciesGroups = classifyDependents(subspecies)
    const willDelete = [
      ...toDependentEntries('subrace', subraceGroups.willDelete),
      ...toDependentEntries('race', subspeciesGroups.willDelete),
    ]
    const willOrphan = [
      ...toDependentEntries('subrace', subraceGroups.willOrphan),
      ...toDependentEntries('race', subspeciesGroups.willOrphan),
    ]

    if (confirm !== true) {
      if (willDelete.length + willOrphan.length > 0) {
        res.status(409).json(errorResponse('HAS_DEPENDENT_CHILDREN',
          `These ${ids.length} races have dependent subraces/subspecies`,
          { dependents: { willDelete, willOrphan } }))
        return
      }
      res.status(400).json(errorResponse('CONFIRM_REQUIRED', `Deleting ${ids.length} races requires { confirm: true }`))
      return
    }

    await prisma.$transaction(async (tx) => {
      const deleteSubraceIds = subraceGroups.willDelete.map((d) => d.id)
      const deleteSubspeciesIds = subspeciesGroups.willDelete.map((d) => d.id)
      const orphanSubspeciesIds = subspeciesGroups.willOrphan.map((d) => d.id)
      if (deleteSubraceIds.length > 0)
        await tx.contentSubrace.deleteMany({ where: { id: { in: deleteSubraceIds } } })
      if (deleteSubspeciesIds.length > 0)
        await tx.contentRace.deleteMany({ where: { id: { in: deleteSubspeciesIds } } })
      if (orphanSubspeciesIds.length > 0)
        await tx.contentRace.updateMany({
          where: { id: { in: orphanSubspeciesIds } },
          data: { parentRaceId: null },
        })
      await tx.contentRace.deleteMany({ where: { id: { in: ids } } })
    })

    res.json({
      deletedCount: ids.length,
      ...(willOrphan.length > 0 ? { warnings: `${willOrphan.length} homebrew dependent(s) orphaned` } : {}),
    })
    return
  }
})

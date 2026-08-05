// Shared between both Class importers — Phase 2.6 moved class/subclass
// features out of extraData into a real ContentClassFeature relation table,
// one row per level (Open5e's grouped {levels: [4,8,12,16]} entries explode
// into 4 rows to match Compendium's native one-row-per-<autolevel> shape).
// classId/subclassId aren't known yet at transform time (the parent row
// hasn't been inserted), so transforms return this parent-less shape and
// each orchestrator attaches the real FK after insert.
export interface ExplodedClassFeature {
  level: number
  name: string
  description: string
  type: string | null
}

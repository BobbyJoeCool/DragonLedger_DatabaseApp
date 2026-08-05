// Each column value in an inserted row is one bound SQL parameter. SQLite's
// own limit (~999 total per query, build-dependent) is far lower than the
// SQL Server limit (~2,100) this app's chunk size was originally sized
// against — a wide model like ContentMonster (~25 columns) at the old
// 500-row chunk size would be 12,500 parameters and fail outright. Compute
// a safe size per model instead, with margin under the 999 ceiling.
const SQLITE_PARAM_LIMIT = 900
const MIN_CHUNK_SIZE = 10

export function computeChunkSize(columnCount: number): number {
  return Math.max(MIN_CHUNK_SIZE, Math.floor(SQLITE_PARAM_LIMIT / columnCount))
}

import type { ReactNode } from 'react'

export interface OrphanedParentFallbackProps {
  /** e.g. "class" or "race" — used only for the italic hint text. */
  parentKind: 'class' | 'race'
  /** extraData.unresolvedClassName / extraData.unresolvedRaceName, if present. */
  unresolvedName?: string | null
}

/**
 * Orphaned-parent fallback convention — §2. Both `ContentSubclass.classId`
 * and `ContentSubrace.raceId` are nullable (`onDelete: SetNull`), with
 * `extraData.unresolvedClassName` / `extraData.unresolvedRaceName` as the
 * only trace of intent when import-time resolution failed. Since both
 * types are normally only reached by drilling into their parent's card, an
 * orphaned row has no parent page to nest under and must render standalone
 * — this is the one shared presentational pattern for that meta line, used
 * identically by both Subclass and Subrace so it can't drift into two
 * slightly different implementations.
 */
export function OrphanedParentMeta({ parentKind, unresolvedName }: OrphanedParentFallbackProps) {
  return (
    <span className="dl-orphan-meta">
      {unresolvedName ?? `Unknown ${parentKind}`} (unresolved — not linked to a {parentKind} record)
    </span>
  )
}

export interface OrphanedParentShellProps extends OrphanedParentFallbackProps {
  children: ReactNode
}

/**
 * Wraps a standalone-rendered orphaned Subclass/Subrace card: no
 * parent-context tab, just the meta line in place of the usual parent
 * link, then everything else (traits/features) renders the same as the
 * linked case via `children`.
 */
export function OrphanedParentShell({ parentKind, unresolvedName, children }: OrphanedParentShellProps) {
  return (
    <div className="dl-orphan-shell">
      <p className="dl-orphan-meta-line">
        <OrphanedParentMeta parentKind={parentKind} unresolvedName={unresolvedName} />
      </p>
      {children}
    </div>
  )
}

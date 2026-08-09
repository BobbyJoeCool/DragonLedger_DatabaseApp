import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useBlocker } from 'react-router'
import { Modal } from '@/components/ui/Modal'

interface UnsavedChangesGuardProps {
  isDirty: boolean
  // A form's own post-save navigate() call runs synchronously, in the same
  // tick as the state update that would flip `isDirty` false — React hasn't
  // re-rendered yet, so the blocker predicate below (a closure over last
  // render's `isDirty`) would still see it as dirty and block the very
  // navigation the save just triggered. A ref reads live at call time
  // instead of a stale per-render snapshot, so a form can flip it
  // synchronously right before calling navigate() after a successful save.
  bypassRef?: RefObject<boolean>
}

// Phase 7 §1.5 — warns before discarding unsaved changes: in-app navigation
// (React Router's data-router blocker) and closing/reloading the tab
// (native beforeunload). Not skipped for v1 per the "marketable product"
// framing in phase-7-edit-create-ui-final-export.md §1.5.
export function UnsavedChangesGuard({ isDirty, bypassRef }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !bypassRef?.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!isDirty) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  if (blocker.state !== 'blocked') return null

  return (
    <Modal title="Discard unsaved changes?" onClose={() => blocker.reset()}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. Leaving this page now will discard them.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => blocker.reset()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => blocker.proceed()}
            className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground"
          >
            Discard changes
          </button>
        </div>
      </div>
    </Modal>
  )
}

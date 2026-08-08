import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

// Same overlay pattern DetailScreen's delete confirmation used in Phase 5,
// pulled out since Phase 6 needs it for three more dialogs. Portaled to
// document.body — several call sites (e.g. SourceRow) render this from
// inside a <tr>, and a `position: fixed` div as a direct child there would
// be invalid table nesting.
export function Modal({ title, onClose, children }: ModalProps) {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md space-y-3 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

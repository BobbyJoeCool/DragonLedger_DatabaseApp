export interface FileFilter {
  name: string
  extensions: string[]
}

type SelectFileResult = { filePath: string } | { canceled: true }

interface ElectronAPI {
  selectFile: (filters?: FileFilter[]) => Promise<SelectFileResult>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

// The client also runs in a plain browser during normal dev (Vite dev
// server, no Electron) — window.electronAPI is only ever defined when
// actually running inside the packaged/dev Electron shell (Phase 6
// Decision 1.1's preload bridge).
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI !== undefined
}

// Returns the picked absolute path, or null if the user canceled. Throws if
// called outside Electron — callers should gate the picker button on
// isElectron() so this never fires in a plain browser.
export async function selectFile(filters?: FileFilter[]): Promise<string | null> {
  if (!window.electronAPI) {
    throw new Error('The file picker is only available in the desktop app.')
  }
  const result = await window.electronAPI.selectFile(filters)
  if ('canceled' in result) return null
  return result.filePath
}

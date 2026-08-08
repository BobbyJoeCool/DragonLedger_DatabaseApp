// .cts (not .ts): Electron's sandboxed preload loader executes this file as
// a plain script, not an ES module — it can't parse `import` at the syntax
// level regardless of this package's "type": "module". TypeScript's .cts
// extension forces CommonJS output (preload.cjs, using require/module.exports
// under the hood) while still letting this file use normal import/export
// syntax at the source level.
import { contextBridge, ipcRenderer } from 'electron'

export interface FileFilter {
  name: string
  extensions: string[]
}

export type SelectFileResult = { filePath: string } | { canceled: true }

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (filters?: FileFilter[]): Promise<SelectFileResult> =>
    ipcRenderer.invoke('dialog:selectFile', { filters }),
})

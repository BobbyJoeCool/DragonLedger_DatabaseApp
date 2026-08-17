import { execFile } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  getClientDistDir,
  getPreloadPath,
  getPrismaCliEntry,
  getPrismaResourceDir,
  getServerDistEntry,
  getUserDataDbPath,
} from './paths.js'

// dialog:selectFile — Phase 6's file-picker bridge (Decision 1.1): the
// renderer has no filesystem access on its own (contextIsolation), so it
// invokes this to get an absolute path back for the Compendium/JSON import
// endpoints, which both take a server-side path string, not an upload.
ipcMain.handle(
  'dialog:selectFile',
  async (_event, args: { filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: args?.filters,
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { filePath: result.filePaths[0] }
  },
)

const execFileAsync = promisify(execFile)

app.setName('DragonLedger')

const windowOptions: Electron.BrowserWindowConstructorOptions = {
  width: 1280,
  height: 800,
  show: false,
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 16, y: 16 },
  webPreferences: {
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
  },
}

async function runMigrations(): Promise<void> {
  const schemaPath = path.join(getPrismaResourceDir(), 'schema.prisma')
  await execFileAsync(process.execPath, [getPrismaCliEntry(), 'migrate', 'deploy', '--schema', schemaPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
}

async function startServer(): Promise<number> {
  const port = Number(process.env.PORT ?? 3000)
  const { app: expressApp } = await import(pathToFileURL(getServerDistEntry()).href)
  await new Promise<void>((resolve) => {
    expressApp.listen(port, resolve)
  })
  return port
}

function createWindow(port: number): void {
  const win = new BrowserWindow(windowOptions)
  win.once('ready-to-show', () => win.show())
  win.loadURL(`http://localhost:${port}`)
}

async function bootstrapProd(): Promise<void> {
  const dbPath = getUserDataDbPath()
  process.env.DATABASE_URL = `file:${dbPath}`
  process.env.PORT = process.env.PORT ?? '3000'
  process.env.CLIENT_ORIGIN = `http://localhost:${process.env.PORT}`
  process.env.CLIENT_DIST_DIR = getClientDistDir()
  process.env.LOG_DIR = app.getPath('logs')
  process.env.NODE_ENV = 'production'

  try {
    await runMigrations()
  } catch (err) {
    dialog.showErrorBox('Database migration failed', String(err))
    app.quit()
    return
  }

  const port = await startServer()
  createWindow(port)
}

async function bootstrapDev(startUrl: string): Promise<void> {
  const win = new BrowserWindow(windowOptions)
  win.once('ready-to-show', () => win.show())
  win.loadURL(startUrl)
}

app.whenReady().then(() => {
  const startUrl = process.env.ELECTRON_START_URL
  const bootstrap = startUrl ? () => bootstrapDev(startUrl) : bootstrapProd
  bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) bootstrap()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

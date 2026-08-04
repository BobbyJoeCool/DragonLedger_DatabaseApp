import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isPackaged = app.isPackaged

export function getAppRoot(): string {
  // dev: electron/dist/paths.js -> repo root is two levels up
  return isPackaged ? app.getAppPath() : path.join(__dirname, '../..')
}

export function getServerDistEntry(): string {
  // packaged: server/dist ships as an extraResource, not inside the app's own files
  return isPackaged
    ? path.join(process.resourcesPath, 'server/dist/app.js')
    : path.join(getAppRoot(), 'server/dist/app.js')
}

export function getClientDistDir(): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'client/dist')
    : path.join(getAppRoot(), 'client/dist')
}

export function getPrismaResourceDir(): string {
  return isPackaged
    ? path.join(process.resourcesPath, 'prisma')
    : path.join(getAppRoot(), 'prisma')
}

export function getPrismaCliEntry(): string {
  return path.join(getAppRoot(), 'node_modules/prisma/build/index.js')
}

export function getUserDataDbPath(): string {
  return path.join(app.getPath('userData'), 'dragonledger.db')
}

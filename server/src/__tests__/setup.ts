import { config } from 'dotenv'
import { appendFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// server/src/__tests__ → ../../../ = project root
const ROOT = resolve(__dirname, '../../..')

config({ path: resolve(ROOT, 'prisma/.env') })
config({ path: resolve(ROOT, '.env') })

const LOGS_DIR = resolve(ROOT, 'DevTools/Tests')
export const LOG_FILE = resolve(LOGS_DIR, 'test-server.log')

export function writeLog(message: string): void {
  const line = `[${new Date().toISOString()}]  ${message}\n`
  mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_FILE, line)
}

writeLog('─── Server test run started ───')

import { appendFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOGS_DIR = resolve(__dirname, '../../../DevTools/Logs')
const LOG_FILE = resolve(LOGS_DIR, 'server.log')

function write(level: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  process.stdout.write(line)
  try {
    mkdirSync(LOGS_DIR, { recursive: true })
    appendFileSync(LOG_FILE, line)
  } catch {
    // never crash the server over a logging failure
  }
}

export const logger = {
  info:  (msg: string) => write('INFO ', msg),
  warn:  (msg: string) => write('WARN ', msg),
  error: (msg: string) => write('ERROR', msg),
}

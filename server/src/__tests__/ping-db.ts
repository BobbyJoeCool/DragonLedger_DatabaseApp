import { config } from 'dotenv'
import { appendFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const LOGS_DIR = resolve(__dirname, '../DevTools/Logs')
const LOG_FILE = resolve(LOGS_DIR, 'db-ping.log')

function writeLog(message: string): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}]  ${message}\n`
  process.stdout.write(line)
  mkdirSync(LOGS_DIR, { recursive: true })
  appendFileSync(LOG_FILE, line)
}

async function ping(): Promise<void> {
  writeLog('Pinging database…')
  const prisma = new PrismaClient()
  const start = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1 AS ping`
    const ms = Date.now() - start
    writeLog(`SUCCESS  Connected in ${ms}ms`)
  } catch (err) {
    const ms = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    writeLog(`FAILED   No connection after ${ms}ms — ${message}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

ping()

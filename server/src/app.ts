import path from 'node:path'
import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { sourcesRouter } from './routes/sources.js'
import { importRouter } from './routes/import.js'
import { errorHandler } from './middleware/errorHandler.js'
import { logger } from './lib/logger.js'

const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

export const app = express()

app.use(cors({ origin: clientOrigin }))
app.use(express.json())

app.use((req, res, next) => {
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} ${res.statusCode}`)
  })
  next()
})

// Write-auth gate disabled — this app is local-only with no reachable-by-
// anyone threat model, so gating mutating requests behind a password no
// longer serves its original purpose. `requireAuth` (middleware/auth.ts)
// and its tests are left intact; restore the call below when Heroes
// integration reintroduces a real reachability scenario. See
// Documentation/architecture-addendum-local-sqlite.md §2.
app.use((_req, _res, next) => next())

app.use('/api', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/sources', sourcesRouter)
app.use('/api/import', importRouter)

// Single-process production mode (Phase 0.7): when CLIENT_DIST_DIR is set,
// Express serves the built React app alongside its own API routes on one
// port. Unset in normal dev mode, where Vite's dev server serves the client
// instead. See Documentation/architecture-addendum-local-sqlite.md §3-4.
const clientDistDir = process.env.CLIENT_DIST_DIR
if (clientDistDir) {
  app.use(express.static(clientDistDir))
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'))
  })
}

app.use(errorHandler)

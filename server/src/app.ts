import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { requireAuth } from './middleware/auth.js'
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

app.use((req, res, next) => {
  const mutating = ['POST', 'PATCH', 'PUT', 'DELETE']
  if (mutating.includes(req.method) && !req.path.startsWith('/api/auth')) {
    requireAuth(req, res, next)
  } else {
    next()
  }
})

app.use('/api', healthRouter)
app.use('/api/auth', authRouter)

app.use(errorHandler)

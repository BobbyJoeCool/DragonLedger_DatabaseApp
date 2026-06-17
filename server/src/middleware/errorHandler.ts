import { type ErrorRequestHandler } from 'express'
import { logger } from '../lib/logger.js'

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error(`${req.method} ${req.path} — ${(err as Error).message}`)
  res.status(500).json({ error: (err as Error).message ?? 'Internal server error' })
}

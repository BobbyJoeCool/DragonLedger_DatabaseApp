import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

// POST /api/auth/check — client uses this to verify the password before storing it
authRouter.post('/check', requireAuth, (_req, res) => {
  res.json({ ok: true })
})

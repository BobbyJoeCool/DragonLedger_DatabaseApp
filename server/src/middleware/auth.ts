import { type RequestHandler } from 'express'

export const requireAuth: RequestHandler = (req, res, next) => {
  const fromHeader = req.headers['x-app-password']
  const fromBearer = req.headers['authorization']?.replace(/^Bearer\s+/i, '')
  const provided = fromHeader ?? fromBearer

  if (!provided || provided !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}

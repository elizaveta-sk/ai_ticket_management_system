import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

function sha256(value: string) {
  return createHash('sha256').update(value).digest()
}

// Webhooks come from a service rather than a signed-in user, so they prove
// themselves with a shared secret. Refuses everything if the secret isn't set.
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (!secret || secret.length < 32 || secret.startsWith('YOUR_')) {
    res.status(503).json({ error: 'Inbound email is not configured' })
    return
  }

  // Hashing gives equal lengths, which timingSafeEqual requires.
  const provided = req.get('x-webhook-secret') ?? ''
  if (!timingSafeEqual(sha256(provided), sha256(secret))) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
